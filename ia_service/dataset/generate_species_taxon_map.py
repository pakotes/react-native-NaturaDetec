import json

with open("species_classes.json", encoding="utf-8") as f:
    class_list = json.load(f)
with open("annotations.json", encoding="utf-8") as f:
    annotations = json.load(f)

species_map = []
for class_name in class_list:
    ann = annotations.get(class_name)
    species_map.append({
        "class_name": class_name,
        "taxon_id": ann.get("taxon_id") if ann else class_name,
        "sci_name": ann.get("sci_name") if ann else None,
        "common_name": ann.get("common_name") if ann else None,
        "group": ann.get("group") if ann else None,
        "wikipedia_url": ann.get("wikipedia_url") if ann else None
    })

with open("species_taxon_map.json", "w", encoding="utf-8") as f:
    json.dump(species_map, f, ensure_ascii=False, indent=2)