import os
import json
import requests
import uuid
from pathlib import Path
from collections import defaultdict

# CONFIGURAÇÕES
BASE_URL = "https://api.inaturalist.org/v1/observations/species_counts?locale=pt&verifiable=true&photos=true&is_atice=true&hrank=kingdom&iconic_taxa%5B%5D={GROUP}&lrank=species&place_id=7122&per_page=200&page={page}&order_by=votes&order=desc&spam=false"
DATASET_DIR = Path("dataset")
ANNOTATIONS_JSON = "annotations.json"
TRAIN_JSON = "train.json"
PROGRESS_JSON = "progress.json"
GROUP = "Aves"  # Grupo taxonómico a processar
DOWNLOAD_IMAGES = True
DOWNLOAD_DELAY = 1.0  # segundos entre downloads

def download_simple_species_photos(taxon_id, group, max_photos=50, base_dir="dataset", train_images_set=None):
    url = f"https://api.inaturalist.org/v1/observations?taxon_id={taxon_id}&preferred_place_id=7122&order_by=votes&quality_grade=research&photos=true&page=&per_page={max_photos*4}"
    try:
        resp = requests.get(url)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[ERRO] Falha ao obter observações para taxon {taxon_id}: {e}")
        return []

    img_paths = []
    dir_path = os.path.join(base_dir, group, taxon_id)
    os.makedirs(dir_path, exist_ok=True)
    downloaded_urls = set()

    for obs in data.get("results", []):
        taxon = obs.get("taxon", {})
        default_photo = taxon.get("default_photo", {})
        img_url = default_photo.get("medium_url")
        if img_url and img_url not in downloaded_urls:
            img_filename = f"default_{len(img_paths)}_{uuid.uuid4().hex}.jpg"
            rel_path = os.path.join(group, taxon_id, img_filename)
            img_path = os.path.join(dir_path, img_filename)
            if train_images_set and rel_path in train_images_set:
                continue
            try:
                r = requests.get(img_url, timeout=10)
                if r.status_code == 200:
                    with open(img_path, "wb") as f:
                        f.write(r.content)
                    print(f"[IMG] {img_url} -> {img_path}")
                    img_paths.append(rel_path)
                    downloaded_urls.add(img_url)
                else:
                    print(f"[ERRO] {img_url} - HTTP {r.status_code}")
            except Exception as e:
                print(f"[ERRO] {img_url} - {e}")
            if len(img_paths) >= max_photos:
                break
    return img_paths

# Inicializa ficheiro de progresso se não existir
if not Path(PROGRESS_JSON).exists():
    with open(PROGRESS_JSON, "w", encoding="utf-8") as f:
        json.dump({
            "page": 1,
            "last_page": 50,
            "species_per_group": {},
            "total_species": 0
        }, f, ensure_ascii=False, indent=2)

# Carrega progresso
with open(PROGRESS_JSON, encoding="utf-8") as f:
    progress = json.load(f)

page = progress["page"]
last_page = progress["last_page"]
species_per_group = defaultdict(int, progress.get("species_per_group", {}))
total_species = progress.get("total_species", 0)
species_ids = set(progress.get("species_ids", []))

# Carrega annotations e train se existirem
if Path(ANNOTATIONS_JSON).exists():
    with open(ANNOTATIONS_JSON, encoding="utf-8") as f:
        annotations = json.load(f)
else:
    annotations = {}

if Path(TRAIN_JSON).exists():
    with open(TRAIN_JSON, encoding="utf-8") as f:
        train_entries = json.load(f)
else:
    train_entries = []

train_images_set = set(e["image"] for e in train_entries)

try:
    while page <= last_page:
        url = BASE_URL.format(GROUP=GROUP, page=page)
        print(f"\n[INFO] A processar página {page}: {url}")
        resp = requests.get(url)
        if resp.status_code != 200:
            print(f"[ERRO] Falha ao obter página {page}: HTTP {resp.status_code}")
            break
        data = resp.json()
        results = data.get("results", [])
        if not results:
            print("[INFO] Não há mais resultados.")
            break

        for item in results:
            t = item["taxon"] if "taxon" in item else item
            taxon_id = str(t["id"])
            group = t.get("iconic_taxon_name", "Unknown")
            sci_name = t.get("name")
            common_name = t.get("preferred_common_name")
            wikipedia_url = t.get("wikipedia_url")

            # Atualizar annotations
            if taxon_id not in annotations:
                annotations[taxon_id] = {
                    "taxon_id": taxon_id,
                    "sci_name": sci_name,
                    "common_name": common_name,
                    "group": group,
                    "wikipedia_url": wikipedia_url
                }
                species_per_group[group] += 1
                total_species += 1
                species_ids.add(taxon_id)

            # Download até 50 fotos reais da espécie e adiciona ao train.json
            fotos_desc = []
            if DOWNLOAD_IMAGES:
                fotos_desc = download_simple_species_photos(
                    taxon_id, group, max_photos=50, base_dir=DATASET_DIR, train_images_set=train_images_set
                )
                if not fotos_desc:
                    print(f"[INFO] Sem fotos reais para {sci_name} ({taxon_id}), a espécie será ignorada.")
                    continue  # Salta para a próxima espécie
                for rel_path in fotos_desc:
                    rel_path_str = str(rel_path)
                    if rel_path_str not in train_images_set:
                        entry = {
                            "image": rel_path_str,
                            "label": taxon_id
                        }
                        train_entries.append(entry)
                        train_images_set.add(rel_path_str)

            print(f"[INFO] {len(fotos_desc)} fotos reais guardadas para {sci_name} ({taxon_id})")

        # Mostrar resumo
        print(f"[RESUMO] Página {page} processada.")
        for g, n in species_per_group.items():
            print(f"  {g}: {n} espécies")
        print(f"  Total acumulado: {total_species} espécies")

        # Guardar progresso e ficheiros
        with open(ANNOTATIONS_JSON, "w", encoding="utf-8") as f:
            json.dump(annotations, f, ensure_ascii=False, indent=2)
        with open(TRAIN_JSON, "w", encoding="utf-8") as f:
            json.dump(train_entries, f, ensure_ascii=False, indent=2)
        with open(PROGRESS_JSON, "w", encoding="utf-8") as f:
            json.dump({
                "page": page + 1,
                "last_page": last_page,
                "species_per_group": dict(species_per_group),
                "total_species": total_species,
                "species_ids": list(species_ids)
            }, f, ensure_ascii=False, indent=2)

        page += 1

except KeyboardInterrupt:
    print("\n[INFO] Interrompido pelo utilizador. Progresso guardado.")
    with open(PROGRESS_JSON, "w", encoding="utf-8") as f:
        json.dump({
            "page": page,
            "last_page": last_page,
            "species_per_group": dict(species_per_group),
            "total_species": total_species,
            "species_ids": list(species_ids)
        }, f, ensure_ascii=False, indent=2)
    print(f"[INFO] Podes retomar a partir da página {page}.")

print("\n[INFO] Script terminado.")