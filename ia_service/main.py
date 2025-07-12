from fastapi import Body, FastAPI, HTTPException, APIRouter
from pydantic import BaseModel
import face_recognition
import numpy as np
import io
import base64
from PIL import Image
import os
import json
import httpx
import socketio
from uuid import uuid4
import time 
from typing import List, Dict
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import OneHotEncoder
import asyncpg
import re

import torch
import torchvision
from torchvision import transforms
from typing import Optional, List

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()

@app.get("/debug_checkpoint_start")
async def debug_checkpoint_start():
    """Checkpoint de debug no início"""
    return {"checkpoint": "start", "status": "ok"}


def clean_old_images(directory, max_age_minutes=10):
    now = time.time()
    for fname in os.listdir(directory):
        fpath = os.path.join(directory, fname)
        if os.path.isfile(fpath):
            file_age = (now - os.path.getmtime(fpath)) / 60  # em minutos
            if file_age > max_age_minutes:
                try:
                    os.remove(fpath)
                except Exception:
                    pass



# --- Healthcheck para LLM ---
router = APIRouter()
@router.get("/llm/health")
async def llm_health():
    ollama_url = os.environ.get("OLLAMA_URL", "http://llm_ollama:11434")
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{ollama_url}/")
            if response.status_code == 200:
                return {"status": "ok"}
            return {"status": "unavailable"}
    except Exception:
        return {"status": "unavailable"}
app.include_router(router)

# ==========================
# 1. REGISTO FACIAL BATCH
# ==========================

class RegisterFaceBatchData(BaseModel):
    email: str
    images: List[str]  # lista de imagens base64

@app.post("/register_faces_batch")
def register_faces_batch(data: RegisterFaceBatchData):
    """
    Recebe várias imagens base64, seleciona as melhores (com face clara) e guarda-as.
    """
    KNOWN_FACES_DIR = os.environ.get("KNOWN_FACES_DIR")
    os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
    selected = 0
    max_to_save = 5
    for idx, img_b64 in enumerate(data.images):
        try:
            image_data = base64.b64decode(img_b64)
            image = Image.open(io.BytesIO(image_data)).convert("RGB")
            image_np = np.array(image)
            faces = face_recognition.face_locations(image_np)
            # Só guarda se detetar exatamente uma face
            if len(faces) == 1 and selected < max_to_save:
                filename = f"{data.email}_{selected+1}.jpg"
                image.save(os.path.join(KNOWN_FACES_DIR, filename))
                selected += 1
        except Exception:
            continue
    return {"saved": selected, "total": len(data.images)}


# ==========================
# 2. RECONHECIMENTO FACIAL
# ==========================

def load_known_faces():
    """Carrega faces conhecidas dinamicamente do diretório"""
    KNOWN_FACES_DIR = os.environ.get("KNOWN_FACES_DIR")
    known_encodings = []
    known_emails = []
    
    if not KNOWN_FACES_DIR or not os.path.exists(KNOWN_FACES_DIR):
        print(f"[DEBUG] Diretório de faces não existe: {KNOWN_FACES_DIR}")
        return known_encodings, known_emails
    
    files = os.listdir(KNOWN_FACES_DIR)
    print(f"[DEBUG] Arquivos encontrados: {files}")
    
    for filename in files:
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            try:
                filepath = os.path.join(KNOWN_FACES_DIR, filename)
                image = face_recognition.load_image_file(filepath)
                encodings = face_recognition.face_encodings(image)
                
                if encodings:
                    known_encodings.append(encodings[0])
                    # Extrair email do nome do arquivo (remove extensão e possível número)
                    email = os.path.splitext(filename)[0]
                    # Remove números do final se existirem (ex: "user@email.com_1" -> "user@email.com")
                    email = email.split('_')[0] if '_' in email else email
                    known_emails.append(email)
                    print(f"[DEBUG] Face carregada: {filename} -> {email}")
                else:
                    print(f"[DEBUG] Nenhuma face encontrada em: {filename}")
            except Exception as e:
                print(f"[DEBUG] Erro ao carregar {filename}: {str(e)}")
    
    print(f"[DEBUG] Total de faces carregadas: {len(known_encodings)}")
    return known_encodings, known_emails

class ImageData(BaseModel):
    image: str  # base64 string


@app.post("/recognize")
def recognize_face(data: ImageData):
    """
    Recebe uma imagem base64, deteta e reconhece a face.
    Retorna o email correspondente (se reconhecido) e a confiança.
    """
    # Carregar faces conhecidas dinamicamente
    known_encodings, known_emails = load_known_faces()
    
    try:
        image_data = base64.b64decode(data.image)
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        image_np = np.array(image)

        face_locations = face_recognition.face_locations(image_np)
        face_encodings = face_recognition.face_encodings(image_np, face_locations)

        if not face_encodings:
            return {"email": None, "confidence": 0, "error": "Nenhuma face detetada na imagem."}
        
        if not known_encodings:
            return {"email": None, "confidence": 0, "error": "Nenhuma face conhecida registada."}

        face_to_check = face_encodings[0]
        distances = face_recognition.face_distance(known_encodings, face_to_check)
        best_match_index = np.argmin(distances)
        confidence = 1 - distances[best_match_index]

        print(f"[DEBUG] Melhor correspondência: {known_emails[best_match_index]} (confiança: {confidence:.2f})")

        if confidence > 0.4:  # Reduzir threshold para teste
            return {
                "email": known_emails[best_match_index], 
                "confidence": round(float(confidence), 2)
            }
        else:
            return {
                "email": None, 
                "confidence": round(float(confidence), 2),
                "error": f"Confiança muito baixa ({confidence:.2f})"
            }
    except Exception as e:
        print(f"[DEBUG] Erro ao processar imagem: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Erro ao processar imagem: {str(e)}")

# ==========================
# 3. IDENTIFICAÇÃO DE ESPÉCIES (PyTorch)
# ==========================

class SpeciesImageData(BaseModel):
    image: str  # base64 string

class SpeciesBatchImageData(BaseModel):
    images: List[str]

def load_species_model():
    """Carrega o modelo de espécies dinamicamente"""
    MODEL_PATH = os.environ.get("SPECIES_MODEL_PATH")
    SPECIES_MAP_PATH = os.environ.get("SPECIES_MAP_PATH", "species_taxon_map.json")
    
    if not MODEL_PATH or not os.path.exists(MODEL_PATH):
        print(f"[DEBUG] Modelo não encontrado: {MODEL_PATH}")
        return None, {}
    
    if not SPECIES_MAP_PATH or not os.path.exists(SPECIES_MAP_PATH):
        print(f"[DEBUG] Mapa de espécies não encontrado: {SPECIES_MAP_PATH}")
        return None, {}
    
    try:
        torch.serialization.add_safe_globals([torchvision.models.resnet.ResNet])
        model = torch.load(MODEL_PATH, map_location=torch.device('cpu'), weights_only=False)
        model.eval()
        
        with open(SPECIES_MAP_PATH, encoding="utf-8") as f:
            idx_to_info = json.load(f)
        
        print(f"[DEBUG] Modelo carregado com sucesso!")
        print(f"[DEBUG] Espécies no mapa: {len(idx_to_info)}")
        return model, idx_to_info
    except Exception as e:
        print(f"[DEBUG] Erro ao carregar modelo: {str(e)}")
        return None, {}

# Transforms para as imagens (ajusta conforme o treino do modelo feito)
species_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    # Normalização típica para modelos ImageNet
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

@app.post("/identify_species")
def identify_species(
    image: Optional[str] = Body(None),
    images: Optional[List[str]] = Body(None)
):
    """
    Identifica espécies numa ou várias imagens.
    - Se receber 'image': processa uma imagem.
    - Se receber 'images': processa várias imagens (batch).
    """
    IDENTIFY_SPECIES_DIR = os.environ.get("IDENTIFY_SPECIES_DIR")
    model, idx_to_info = load_species_model()
    
    print(f"[DEBUG] Modelo carregado: {model is not None}")
    print(f"[DEBUG] Mapa de espécies: {len(idx_to_info)} espécies")
    
    if model is None or not idx_to_info:
        return {
            "error": "Modelo de espécies não carregado ou mapa de espécies vazio",
            "debug": {
                "model_loaded": model is not None,
                "species_map_size": len(idx_to_info),
                "MODEL_PATH": os.environ.get("SPECIES_MODEL_PATH"),
                "SPECIES_MAP_PATH": os.environ.get("SPECIES_MAP_PATH", "species_taxon_map.json")
            }
        }
    
    # Limpa imagens antigas antes de processar
    if IDENTIFY_SPECIES_DIR and os.path.exists(IDENTIFY_SPECIES_DIR):
        clean_old_images(IDENTIFY_SPECIES_DIR, max_age_minutes=10)
    
     # --- Batch ---
    if images:
        predictions = []
        for img_b64 in images:
            try:
                result = _identify_species_single(img_b64, model, idx_to_info)
                predictions.append(result)
            except Exception as e:
                predictions.append({"error": str(e)})

        # Agregação dos resultados
        label_counts = {}
        label_confidences = {}
        for pred in predictions:
            if "label" in pred:
                label = pred["label"]
                conf = pred.get("confidence", 0)
                label_counts[label] = label_counts.get(label, 0) + 1
                label_confidences[label] = label_confidences.get(label, 0) + conf

        if not label_counts:
            return {"error": "Nenhuma espécie identificada nas imagens."}

        # Escolher a espécie mais votada (maior número de predições)
        best_label = max(label_counts, key=label_counts.get)
        count = label_counts[best_label]
        avg_conf = label_confidences[best_label] / count if count else 0
        species_info = idx_to_info[best_label] if 0 <= best_label < len(idx_to_info) else {}

        return {
            "label": best_label,
            "species": species_info.get("sci_name", "Desconhecido"),
            "common_name": species_info.get("common_name", ""),
            "group": species_info.get("group", ""),
            "confidence": round(avg_conf, 3),
            "taxon_id": species_info.get("taxon_id", best_label),
            "image_url": species_info.get("image_url", None),
            "votes": count,
            "total_photos": len(images),
            "debug": {
                "labels_voted": label_counts,
                "avg_confidences": {k: round(v/label_counts[k], 3) for k, v in label_confidences.items()}
            }
        }
    
    # --- Single ---
    if image:
        try:
            result = _identify_species_single(image, model, idx_to_info)
            return result
        except Exception as e:
            print(f"[DEBUG] Erro ao identificar espécie: {str(e)}")
            return {
                "error": f"Erro ao identificar espécie: {str(e)}",
                "debug": {
                    "model_loaded": model is not None,
                    "species_map_size": len(idx_to_info)
                }
            }
    return {"error": "Nenhuma imagem fornecida."}

def _identify_species_single(image_b64: str, model, idx_to_info):
    image_data = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_data)).convert("RGB")
    input_tensor = species_transform(image).unsqueeze(0)
    print(f"[DEBUG] Imagem processada: {input_tensor.shape}")
    with torch.no_grad():
        outputs = model(input_tensor)
        probs = torch.softmax(outputs, dim=1)
        confidence, predicted = torch.max(probs, 1)
        label = predicted.item()
    print(f"[DEBUG] Predição - Label: {label}, Confiança: {confidence.item():.3f}")
    if 0 <= label < len(idx_to_info):
        species_info = idx_to_info[label]
        print(f"[DEBUG] Espécie encontrada: {species_info.get('sci_name', 'Desconhecido')}")
    else:
        species_info = {}
        print(f"[DEBUG] Label fora do range: {label} (máx: {len(idx_to_info)-1})")
    return {
        "label": label,
        "species": species_info.get("sci_name", "Desconhecido"),
        "common_name": species_info.get("common_name", ""),
        "group": species_info.get("group", ""),
        "confidence": float(confidence[0].item()),
        "taxon_id": species_info.get("taxon_id", label),
        "image_url": species_info.get("image_url", None),
        "debug": {
            "model_loaded": True,
            "species_map_size": len(idx_to_info),
            "prediction_in_range": 0 <= label < len(idx_to_info)
        }
    }

# ==========================
# 3. RECOMENDAÇÂO DE ESPÉCIES
# ==========================

class RecommendationRequest(BaseModel):
    user_groups: List[str]
    user_families: List[str]
    seen_taxon_ids: List[str]
    candidates: List[Dict]

@app.post("/recommendations")
def recommend(data: RecommendationRequest):
    # 1. Prepara os dados dos candidatos (só com grupo válido)
    candidates = [c for c in data.candidates if c.get("group")]
    taxon_ids = [str(c["taxon_id"]) for c in candidates]

    # 2. Features: grupo + família
    features = [
        (c.get("group", "None"), c.get("family", "None"))
        for c in candidates
    ]

    if not features:
        filtered = [c for c in data.candidates if str(c["taxon_id"]) not in data.seen_taxon_ids]
        return {"results": filtered[:10]}

    # 3. One-hot encoding dos features
    encoder = OneHotEncoder(sparse_output=False)
    X = encoder.fit_transform(features)

    # 4. Vetor de preferências do utilizador (grupo+família)
    # Considera todos os pares (grupo, família) favoritos do utilizador
    valid_user_features = []
    for c in candidates:
        if (c.get("group") in getattr(data, "user_groups", [])) or (c.get("family") in getattr(data, "user_families", [])):
            valid_user_features.append((c.get("group", "None"), c.get("family", "None")))

    if valid_user_features:
        user_vec = encoder.transform(valid_user_features).mean(axis=0).reshape(1, -1)
    else:
        filtered = [c for c in candidates if str(c["taxon_id"]) not in data.seen_taxon_ids]
        return {"results": filtered[:10]}

    # 5. KNN para encontrar os candidatos mais próximos das preferências do utilizador
    n_neighbors = min(10, len(X))
    knn = NearestNeighbors(n_neighbors=n_neighbors, metric='cosine')
    knn.fit(X)
    distances, indices = knn.kneighbors(user_vec)

    # 6. Filtra para não recomendar já vistos/favoritos
    recommended = []
    print("=== Recomendações por proximidade (distância do KNN) ===")
    for dist, idx in zip(distances[0], indices[0]):
        especie = candidates[idx]
        print(f"Distância: {dist:.4f} | Nome comum: {especie.get('common_name')} | Grupo: {especie.get('group')} | Família: {especie.get('family')} | taxon_id: {especie.get('taxon_id')}")
        if taxon_ids[idx] not in data.seen_taxon_ids:
            recommended.append(especie)
        if len(recommended) == 10:
            break

    return {"results": recommended}

# ==========================
# 4. SISTEMA DE RECOMENDAÇÕES AVANÇADO
# ==========================

class AdvancedRecommendationRequest(BaseModel):
    user_id: str
    user_groups: List[str]
    user_families: List[str]
    seen_taxon_ids: List[str]
    user_location: Optional[Dict] = None  # {"lat": float, "lng": float}
    candidates: List[Dict]
    algorithm: Optional[str] = "hybrid"  # "knn", "content", "collaborative", "hybrid"
    limit: Optional[int] = 10

class UserInteractionData(BaseModel):
    user_id: str
    taxon_id: str
    interaction_type: str  # "view", "favorite", "identify", "search"
    confidence: Optional[float] = None
    timestamp: Optional[str] = None

@app.post("/record_interaction")
async def record_interaction(data: UserInteractionData):
    """Regista interações do utilizador na base de dados para melhorar recomendações"""
    try:
        conn = await asyncpg.connect(
            host=os.environ.get("POSTGRES_HOST"),
            port=int(os.environ.get("POSTGRES_PORT")),
            user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"),
            database=os.environ.get("POSTGRES_DB"),
        )
        
        await conn.execute(
            """INSERT INTO user_species_history (user_id, taxon_id, action, created_at) 
               VALUES ($1, $2, $3, CURRENT_TIMESTAMP)""",
            int(data.user_id), int(data.taxon_id), data.interaction_type
        )
        
        await conn.close()
        return {"status": "recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gravar interação: {str(e)}")

async def get_user_interactions(user_id: str, limit: int = 100):
    """Obtém interações do utilizador da base de dados"""
    try:
        conn = await asyncpg.connect(
            host=os.environ.get("POSTGRES_HOST"),
            port=int(os.environ.get("POSTGRES_PORT")),
            user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"),
            database=os.environ.get("POSTGRES_DB"),
        )
        
        rows = await conn.fetch(
            """SELECT taxon_id, action, created_at 
               FROM user_species_history 
               WHERE user_id = $1 
               ORDER BY created_at DESC 
               LIMIT $2""",
            int(user_id), limit
        )
        
        await conn.close()
        
        interactions = []
        for row in rows:
            interactions.append({
                "taxon_id": str(row["taxon_id"]),
                "type": row["action"],
                "timestamp": str(row["created_at"])
            })
        
        return interactions
    except Exception as e:
        print(f"Erro ao obter interações: {e}")
        return []

@app.post("/advanced_recommendations")
async def advanced_recommend(data: AdvancedRecommendationRequest):
    """Sistema de recomendações avançado com múltiplos algoritmos"""
    
    if data.algorithm == "knn":
        return await _knn_recommendations(data)
    elif data.algorithm == "content":
        return await _content_based_recommendations(data)
    elif data.algorithm == "collaborative":
        return await _collaborative_filtering(data)
    elif data.algorithm == "hybrid":
        return await _hybrid_recommendations(data)
    else:
        return {"error": "Algoritmo não suportado"}

async def _knn_recommendations(data: AdvancedRecommendationRequest):
    """Recomendações baseadas em KNN """
    candidates = [c for c in data.candidates if c.get("group")]
    
    if not candidates:
        return {"results": [], "algorithm": "knn", "explanation": "Sem candidatos válidos"}
    
    # Features expandidas: grupo, família, habitat, tipo_observacao
    features = []
    for c in candidates:
        feature_tuple = (
            c.get("group", "None"),
            c.get("family", "None"),
            c.get("habitat", "None"),
            c.get("observation_type", "None")
        )
        features.append(feature_tuple)
    
    encoder = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
    X = encoder.fit_transform(features)
    
    # Vetor de preferências baseado em interações passadas (da base de dados)
    user_interactions_data = await get_user_interactions(data.user_id)
    user_preferred_features = []
    
    for interaction in user_interactions_data:
        if interaction["type"] in ["favorite", "identify"]:
            # Encontrar características desta espécie nos candidatos
            for c in candidates:
                if str(c.get("taxon_id")) == interaction["taxon_id"]:
                    user_preferred_features.append((
                        c.get("group", "None"),
                        c.get("family", "None"),
                        c.get("habitat", "None"),
                        c.get("observation_type", "None")
                    ))
    
    # Fallback para preferências explícitas
    if not user_preferred_features:
        for c in candidates:
            if (c.get("group") in data.user_groups) or (c.get("family") in data.user_families):
                user_preferred_features.append((
                    c.get("group", "None"),
                    c.get("family", "None"),
                    c.get("habitat", "None"),
                    c.get("observation_type", "None")
                ))
    
    if not user_preferred_features:
        filtered = [c for c in candidates if str(c["taxon_id"]) not in data.seen_taxon_ids]
        return {"results": filtered[:data.limit], "algorithm": "knn", "explanation": "Sem preferências, retornando aleatório"}
    
    user_vec = encoder.transform(user_preferred_features).mean(axis=0).reshape(1, -1)
    
    # KNN com pesos baseados em interações
    n_neighbors = min(data.limit * 2, len(X))
    knn = NearestNeighbors(n_neighbors=n_neighbors, metric='cosine')
    knn.fit(X)
    distances, indices = knn.kneighbors(user_vec)
    
    recommended = []
    for dist, idx in zip(distances[0], indices[0]):
        especie = candidates[idx]
        if str(especie["taxon_id"]) not in data.seen_taxon_ids:
            especie["recommendation_score"] = round(1 - dist, 3)
            recommended.append(especie)
        if len(recommended) >= data.limit:
            break
    
    return {"results": recommended, "algorithm": "knn", "explanation": f"Baseado em {len(user_preferred_features)} preferências"}

async def _content_based_recommendations(data: AdvancedRecommendationRequest):
    """Recomendações baseadas no conteúdo das espécies"""
    candidates = [c for c in data.candidates if c.get("group")]
    
    # Pontuação baseada em características
    scored_candidates = []
    user_interactions_data = await get_user_interactions(data.user_id)
    
    # Análise de padrões de interação
    interaction_weights = {
        "favorite": 3.0,
        "identify": 2.0,
        "view": 1.0,
        "search": 1.5
    }
    
    group_scores = {}
    family_scores = {}
    
    for interaction in user_interactions_data:
        weight = interaction_weights.get(interaction["type"], 1.0)
        for c in candidates:
            if str(c.get("taxon_id")) == interaction["taxon_id"]:
                group = c.get("group", "")
                family = c.get("family", "")
                group_scores[group] = group_scores.get(group, 0) + weight
                family_scores[family] = family_scores.get(family, 0) + weight
    
    # Calcular pontuações para cada candidato
    for candidate in candidates:
        if str(candidate["taxon_id"]) in data.seen_taxon_ids:
            continue
            
        score = 0
        
        # Pontuação por grupo
        group = candidate.get("group", "")
        if group in group_scores:
            score += group_scores[group] * 0.4
        elif group in data.user_groups:
            score += 2.0
            
        # Pontuação por família
        family = candidate.get("family", "")
        if family in family_scores:
            score += family_scores[family] * 0.6
        elif family in data.user_families:
            score += 1.5
        
        # Boost para espécies raras ou com boa qualidade de imagem
        if candidate.get("rarity_score", 0) > 0.7:
            score += 1.0
        if candidate.get("image_quality", 0) > 0.8:
            score += 0.5
            
        candidate["recommendation_score"] = round(score, 3)
        scored_candidates.append(candidate)
    
    # Ordenar por pontuação
    scored_candidates.sort(key=lambda x: x["recommendation_score"], reverse=True)
    
    return {
        "results": scored_candidates[:data.limit],
        "algorithm": "content-based",
        "explanation": f"Baseado em {len(user_interactions_data)} interações passadas"
    }

async def _collaborative_filtering(data: AdvancedRecommendationRequest):
    """Recomendações baseadas em filtragem colaborativa (utilizadores similares)"""
    # Simplificado: encontrar utilizadores com interações similares
    current_user_interactions = set()
    user_interactions_data = await get_user_interactions(data.user_id)
    
    for interaction in user_interactions_data:
        if interaction["type"] in ["favorite", "identify"]:
            current_user_interactions.add(interaction["taxon_id"])
    
    # Encontrar utilizadores similares (consultar base de dados)
    similar_users = []
    try:
        conn = await asyncpg.connect(
            host=os.environ.get("POSTGRES_HOST"),
            port=int(os.environ.get("POSTGRES_PORT")),
            user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"),
            database=os.environ.get("POSTGRES_DB"),
        )
        
        # Obter todos os utilizadores com interações
        all_users = await conn.fetch(
            "SELECT DISTINCT user_id FROM user_species_history WHERE user_id != $1",
            int(data.user_id)
        )
        
        for user_row in all_users:
            other_user_id = str(user_row["user_id"])
            other_interactions_data = await get_user_interactions(other_user_id)
            
            other_interactions = set()
            for interaction in other_interactions_data:
                if interaction["type"] in ["favorite", "identify"]:
                    other_interactions.add(interaction["taxon_id"])
            
            # Calcular similaridade (Jaccard)
            if current_user_interactions and other_interactions:
                intersection = len(current_user_interactions.intersection(other_interactions))
                union = len(current_user_interactions.union(other_interactions))
                similarity = intersection / union if union > 0 else 0
                
                if similarity > 0.1:  # Threshold mínimo
                    similar_users.append((other_user_id, similarity, other_interactions_data))
        
        await conn.close()
    except Exception as e:
        print(f"Erro ao obter utilizadores similares: {e}")
        return {"results": [], "algorithm": "collaborative", "explanation": "Erro ao processar dados"}
    
    # Recomendar espécies que utilizadores similares gostaram
    recommendations = {}
    for similar_user_id, similarity, similar_user_interactions in similar_users:
        for interaction in similar_user_interactions:
            if (interaction["type"] in ["favorite", "identify"] and 
                interaction["taxon_id"] not in current_user_interactions and
                interaction["taxon_id"] not in data.seen_taxon_ids):
                
                taxon_id = interaction["taxon_id"]
                if taxon_id not in recommendations:
                    recommendations[taxon_id] = 0
                recommendations[taxon_id] += similarity
    
    # Encontrar candidatos correspondentes
    recommended_candidates = []
    for candidate in data.candidates:
        taxon_id = str(candidate["taxon_id"])
        if taxon_id in recommendations:
            candidate["recommendation_score"] = round(recommendations[taxon_id], 3)
            recommended_candidates.append(candidate)
    
    # Ordenar por pontuação
    recommended_candidates.sort(key=lambda x: x["recommendation_score"], reverse=True)
    
    return {
        "results": recommended_candidates[:data.limit],
        "algorithm": "collaborative",
        "explanation": f"Baseado em {len(similar_users)} utilizadores similares"
    }

async def _hybrid_recommendations(data: AdvancedRecommendationRequest):
    """Combinação de múltiplos algoritmos"""
    # Obter recomendações de cada algoritmo
    knn_results = await _knn_recommendations(data)
    content_results = await _content_based_recommendations(data)
    collab_results = await _collaborative_filtering(data)
    
    knn_list = knn_results["results"]
    content_list = content_results["results"]
    collab_list = collab_results["results"]
    
    # Combinar pontuações com pesos
    combined_scores = {}
    weights = {"knn": 0.3, "content": 0.4, "collaborative": 0.3}
    
    # Processar KNN
    for i, candidate in enumerate(knn_list):
        taxon_id = str(candidate["taxon_id"])
        score = candidate.get("recommendation_score", 0) * weights["knn"]
        # Boost para posições superiores
        position_boost = (len(knn_list) - i) / len(knn_list) * 0.5 if knn_list else 0
        combined_scores[taxon_id] = score + position_boost
    
    # Processar Content-based
    for i, candidate in enumerate(content_list):
        taxon_id = str(candidate["taxon_id"])
        score = candidate.get("recommendation_score", 0) * weights["content"]
        position_boost = (len(content_list) - i) / len(content_list) * 0.3 if content_list else 0
        combined_scores[taxon_id] = combined_scores.get(taxon_id, 0) + score + position_boost
    
    # Processar Collaborative
    for i, candidate in enumerate(collab_list):
        taxon_id = str(candidate["taxon_id"])
        score = candidate.get("recommendation_score", 0) * weights["collaborative"]
        position_boost = (len(collab_list) - i) / len(collab_list) * 0.2 if collab_list else 0
        combined_scores[taxon_id] = combined_scores.get(taxon_id, 0) + score + position_boost
    
    # Criar lista final combinada
    final_recommendations = []
    for candidate in data.candidates:
        taxon_id = str(candidate["taxon_id"])
        if taxon_id in combined_scores and taxon_id not in data.seen_taxon_ids:
            candidate["recommendation_score"] = round(combined_scores[taxon_id], 3)
            candidate["algorithm"] = "hybrid"
            final_recommendations.append(candidate)
    
    # Ordenar e limitar
    final_recommendations.sort(key=lambda x: x["recommendation_score"], reverse=True)
    
    return {
        "results": final_recommendations[:data.limit],
        "algorithm": "hybrid",
        "explanation": f"Combinação de KNN ({len(knn_list)}), Content ({len(content_list)}), Collaborative ({len(collab_list)})"
    }

@app.get("/user_insights/{user_id}")
async def get_user_insights(user_id: str):
    """Análise das preferências e padrões do utilizador"""
    interactions = await get_user_interactions(user_id)
    
    if not interactions:
        return {"message": "Sem dados suficientes"}
    
    # Análise de grupos preferidos
    group_counts = {}
    family_counts = {}
    interaction_type_counts = {}
    
    for interaction in interactions:
        interaction_type = interaction["type"]
        interaction_type_counts[interaction_type] = interaction_type_counts.get(interaction_type, 0) + 1
    
    # Calcular métricas
    total_interactions = len(interactions)
    engagement_score = (
        interaction_type_counts.get("favorite", 0) * 3 +
        interaction_type_counts.get("identify", 0) * 2 +
        interaction_type_counts.get("view", 0) * 1
    ) / total_interactions if total_interactions > 0 else 0
    
    return {
        "total_interactions": total_interactions,
        "engagement_score": round(engagement_score, 2),
        "interaction_breakdown": interaction_type_counts,
        "most_active_period": "análise temporal não implementada",
        "recommended_exploration": "grupos menos explorados"
    }

# ==========================
# 5. LLM/SocketIO
# ==========================

# Instruções padrão para todos os LLMs (fallback quando não há prompt personalizado)
SYSTEM_PROMPT = (
    "És o NaturaBot, um assistente especializado em biodiversidade e espécies naturais. "
    "IMPORTANTE: O teu nome é NaturaBot e deves identificar-te sempre como tal quando perguntado sobre a tua identidade. "
    "RESPONDE SEMPRE EM PORTUGUÊS EUROPEU, nunca em português brasileiro ou outros idiomas. "
    "COMPETÊNCIAS: fauna, flora, taxonomia, ecologia, conservação, identificação de espécies, habitats e comportamento animal. "
    "MODO DE RESPOSTA: estruturado, científico mas acessível, transparente sobre limitações de dados, "
    "promociona interesse pela natureza. Inclui nomes científicos quando relevante. "
    "Quando tens informação específica indexada, usa-a. Quando não tens, sê honesto sobre essa limitação. "
    "NUNCA te identifiques como Llama, Claude, GPT ou qualquer outro nome que não seja NaturaBot."
)

# Função para detectar perguntas sobre identidade do bot
def is_identity_question(prompt: str) -> bool:
    """Verifica se a pergunta é sobre a identidade do bot"""
    identity_patterns = [
        "qual.*teu nome", "como.*chamas", "quem.*s", "que bot", "teu nome",
        "qual.*o teu nome", "como.*te chamas", "quem.*tu", "quem és",
        "apresenta-te", "apresentar", "identifica-te", "diz.*nome"
    ]
    
    prompt_lower = prompt.lower()
    for pattern in identity_patterns:
        if re.search(pattern, prompt_lower):
            return True
    return False

# Handler para LLM local via Ollama
# Modelo LLM(1) após integração funcional foi substituido via OpenRouter por um LLM(2) avançado.
@sio.event
async def llm_message(sid, data):
    prompt = data.get("prompt")
    ollama_url = os.environ.get("OLLAMA_URL", "http://llm_ollama:11434")

    if not prompt:
        await sio.emit("llm_response", {"error": "Prompt em falta."}, to=sid)
        return

    try:
        # Verificar se o serviço Ollama está ativo
        async with httpx.AsyncClient(timeout=3) as client:
            health = await client.get(f"{ollama_url}/")
            if health.status_code != 200:
                await sio.emit("llm_response", {"error": "O serviço LLM não está disponível de momento."}, to=sid)
                return
    except Exception:
        await sio.emit("llm_response", {"error": "O serviço LLM não está disponível de momento."}, to=sid)
        return

    try:
        # Enviar prompt para o modelo local
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": "llama3",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt}
                    ],
                    "stream": False
                }
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("message", "")
            await sio.emit("llm_response", {"response": content}, to=sid)
    except Exception as e:
        await sio.emit("llm_response", {"error": f"Erro ao comunicar com o LLM: {str(e)}"}, to=sid)


# Handler para LLM(2) externo via OpenRouter

# Modelo de dados para documentos de natureza
class NaturaDoc(BaseModel):
    taxon_id: Optional[str] = None
    nome_comum: Optional[str] = ""
    nome_cientifico: Optional[str] = ""
    descricao: Optional[str] = ""

@sio.event
async def llm2_message(sid, data):
    prompt = data.get("prompt")
    model = data.get("model", "meta-llama/llama-3-8b-instruct")
    api_key = data.get("api_key")
    custom_system = data.get("system")  # Prompt personalizado do frontend

    if not prompt or not api_key:
        await sio.emit("llm2_response", {"error": "Prompt ou API key em falta."}, to=sid)
        return

    # Verificar se é uma pergunta sobre identidade do bot
    is_identity = is_identity_question(prompt)
    
    # 1. Pesquisa contexto relevante no Postgres (RAG) - APENAS se não for pergunta de identidade
    context_list = []
    if not is_identity:
        context_list = await search_similar_documents(prompt, top_k=3)
        
        # Se não há contexto relevante, tenta uma procura mais ampla por termos-chave
        if not context_list:
            # Extrai palavras-chave do prompt para procura alternativa
            keywords = await extract_species_keywords(prompt)
            if keywords:
                context_list = await search_by_keywords(keywords)
    
    context = "\n\n".join(context_list) if context_list else "Sem contexto relevante na base de dados."

    # 2. Junta contexto ao prompt com instruções específicas
    if context_list and not is_identity:
        full_prompt = f"""Contexto científico disponível sobre espécies naturais:
{context}

IMPORTANTE: O contexto acima é sobre espécies naturais. Só use este contexto se a pergunta for ESPECIFICAMENTE sobre fauna, flora, espécies, animais ou plantas.

Pergunta do utilizador: {prompt}

Se a pergunta for sobre espécies/natureza E o contexto for relevante, usa-o para dar uma resposta detalhada e científica. 
Se a pergunta NÃO for sobre espécies/natureza (ex: perguntas pessoais, cumprimentos, identidade), IGNORA completamente o contexto e responde normalmente como o NaturaBot.
Se a pergunta for sobre espécies mas o contexto não é relevante, indica que não tens informação específica indexada."""
    else:
        full_prompt = f"""Pergunta: {prompt}

Responde como o NaturaBot. Se a pergunta for sobre espécies naturais, indica que não tens informação específica indexada sobre o assunto mas podes dar informações gerais se conheceres."""

    # 3. Usa prompt de sistema personalizado se fornecido, senão usa o padrão
    system_prompt = custom_system if custom_system else SYSTEM_PROMPT

    try:
        # Preparar corpo da requisição com parâmetros melhorados
        request_body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_prompt}
            ],
            "temperature": 0.25,  # Balance entre criatividade e precisão
            "max_tokens": 1024,  # Tamanho máximo da resposta
            "top_p": 0.9,  # Controle de diversidade
            "stream": False,  # Sem streaming
            "frequency_penalty": 0.3,  # Reduz repetições
            "presence_penalty": 0.2   # Incentiva novos tópicos
        }
        
        # Headers melhorados
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://naturadetec.app",
            "X-Title": "NaturaDetec"
        }
        
        print(f"[LLM2 DEBUG] Request body: {json.dumps(request_body, ensure_ascii=False)[:300]}...")
        
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=request_body
            )
            
            response.raise_for_status()
            data = response.json()
            
            if "choices" not in data or len(data["choices"]) == 0:
                raise Exception("Resposta da API não contém choices válidos")
                
            content = data["choices"][0]["message"]["content"]
            
            # Inclui informação sobre uso do RAG na resposta
            rag_info = {
                "response": content,
                "rag_used": len(context_list) > 0,
                "rag_documents_count": len(context_list)
            }
            
            print(f"LLM2 Response: {content}")
            print(f"[RAG] Documentos usados: {len(context_list)}")
            await sio.emit("llm2_response", rag_info, to=sid)
    except httpx.HTTPStatusError as e:
        error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
        print(f"[LLM2 ERROR] {error_detail}")
        await sio.emit("llm2_response", {"error": f"Erro HTTP na API: {error_detail}"}, to=sid)
    except Exception as e:
        print(f"[LLM2 ERROR] {str(e)}")
        await sio.emit("llm2_response", {"error": f"Erro ao comunicar com o LLM externo: {str(e)}"}, to=sid)



# Pesquisa de contexto para RAG

# Esta função obtém a representação vetorial de um texto usando o modelo nomic-embed-text
async def get_embedding(text: str) -> list:
    ollama_url = os.environ.get("OLLAMA_URL", "http://llm_ollama:11434")
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{ollama_url}/api/embeddings",
            json={"model": "nomic-embed-text", "prompt": text}
        )
        response.raise_for_status()
        data = response.json()
        return data["embedding"]

# Esta função pesquisa documentos similares na BD usando a extensão pgvector
# Ela recebe um texto de consulta e retorna os documentos mais similares com base na distância do embedding
async def search_similar_documents(query: str, top_k: int = 3, similarity_threshold: float = 18.5):
    # Verifica se é uma pergunta sobre identidade/apresentação do bot
    query_lower = query.lower()
    identity_questions = [
        "qual o teu nome", "quem és", "como te chamas", "qual é o teu nome",
        "who are you", "what is your name", "tell me about yourself",
        "apresenta-te", "apresenta te", "nome do bot", "identificação"
    ]
    
    for identity_q in identity_questions:
        if identity_q in query_lower:
            return []  # Não usar RAG para perguntas sobre identidade
    
    # Gera embedding do query
    query_embedding = await get_embedding(query)
    embedding_str = "[" + ",".join(str(float(x)) for x in query_embedding) + "]"
    conn = await asyncpg.connect(
        host=os.environ.get("POSTGRES_HOST"),
        port=int(os.environ.get("POSTGRES_PORT")),
        user=os.environ.get("POSTGRES_USER"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        database=os.environ.get("POSTGRES_DB"),
    )
    
    # Pesquisa por similaridade com distância (menor distância = mais similar)
    # Para pgvector <-> operator: 0 = idêntico, 2 = completamente diferente
    rows = await conn.fetch(
        """
        SELECT content, (embedding <-> $1) as distance
        FROM documents
        ORDER BY embedding <-> $1
        LIMIT $2
        """,
        embedding_str, top_k
    )
    await conn.close()
    
    # Retorna apenas documentos com similaridade suficiente
    relevant_docs = [row["content"] for row in rows if float(row["distance"]) < similarity_threshold]
    
    # Log resumido
    print(f"[RAG] Query: '{query}' | Docs: {len(rows) if rows else 0} | Relevantes: {len(relevant_docs)}")
    
    return relevant_docs

# Esta função pesquisa informações relevantes sobre espécies usando a API iNature
async def search_documents(prompt: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Pesquisa por nome comum ou científico
            response = await client.get(f"https://inature.pt/api/especies?search={prompt}")
            if response.status_code == 200:
                data = response.json()
                # Junta os nomes e descrições das primeiras espécies encontradas
                context = ""
                for item in data.get("results", [])[:3]:
                    context += f"Nome: {item.get('nome_comum', '')}\nDescrição: {item.get('descricao', '')}\n\n"
                return context if context else "Sem resultados relevantes."
            else:
                return "Sem resultados relevantes."
    except Exception as e:
        return f"Erro ao pesquisar contexto: {str(e)}"
    
# Esta função insere ou atualiza um documento na base de dados Postgres (UPSERT)
async def upsert_document(content: str, embedding: list, taxon_id: Optional[str], nome_cientifico: Optional[str]):
    conn = await asyncpg.connect(
        host=os.environ.get("POSTGRES_HOST"),
        port=int(os.environ.get("POSTGRES_PORT")),
        user=os.environ.get("POSTGRES_USER"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        database=os.environ.get("POSTGRES_DB"),
    )
    
    # Converte o embedding para string para pgvector
    embedding_str = "[" + ",".join(str(float(x)) for x in embedding) + "]"
    
    try:
        # Verificar se já existe documento para este taxon_id
        existing = await conn.fetchrow(
            "SELECT id, content, created_at FROM documents WHERE taxon_id = $1",
            taxon_id
        )
        
        if existing:
            # Atualizar documento existente
            await conn.execute(
                """UPDATE documents 
                   SET content = $1, embedding = $2, nome_cientifico = $3, updated_at = CURRENT_TIMESTAMP 
                   WHERE taxon_id = $4""",
                content, embedding_str, nome_cientifico, taxon_id
            )
            return "updated"
        else:
            # Inserir novo documento
            await conn.execute(
                "INSERT INTO documents (taxon_id, nome_cientifico, content, embedding) VALUES ($1, $2, $3, $4)",
                taxon_id, nome_cientifico, content, embedding_str
            )
            return "inserted"
            
    except Exception as e:
        print(f"[RAG] Erro ao processar documento {taxon_id}: {str(e)}")
        return "error"
    finally:
        await conn.close() 

@app.post("/api/insert_natura")
async def insert_documents_natura(docs: List[NaturaDoc]):
    inserted = 0
    updated = 0
    errors = 0
    
    for doc in docs:
        try:
            content = f"Nome comum: {doc.nome_comum}\nNome científico: {doc.nome_cientifico}\nDescrição: {doc.descricao}"
            embedding = await get_embedding(content)
            result = await upsert_document(content, embedding, doc.taxon_id, doc.nome_cientifico)
            
            if result == "inserted":
                inserted += 1
            elif result == "updated":
                updated += 1
            else:  # fallback
                inserted += 1  # Contar como inserção para compatibilidade
                
        except Exception as e:
            errors += 1
            # Erro já logado na função upsert_document
    
    print(f"[RAG] Processamento: {inserted} novos, {updated} atualizados, {errors} erros")
    
    total_processed = inserted + updated
    
    return {
        "status": "ok", 
        "inserted": total_processed,  # Compatibilidade com código existente
        "details": {
            "new_documents": inserted,
            "updated_documents": updated,
            "errors": errors,
            "total_processed": total_processed
        }
    }

# ==========================
# 6. ENDPOINTS DE MÉTRICAS E SAÚDE DO SISTEMA
# ==========================

@app.get("/recommendations/health")
async def recommendations_health():
    """Verifica a saúde do sistema de recomendações"""
    try:
        conn = await asyncpg.connect(
            host=os.environ.get("POSTGRES_HOST"),
            port=int(os.environ.get("POSTGRES_PORT")),
            user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"),
            database=os.environ.get("POSTGRES_DB"),
        )
        
        total_users_result = await conn.fetchval("SELECT COUNT(DISTINCT user_id) FROM user_species_history")
        total_interactions_result = await conn.fetchval("SELECT COUNT(*) FROM user_species_history")
        
        await conn.close()
        
        total_users = total_users_result or 0
        total_interactions = total_interactions_result or 0
    except Exception as e:
        print(f"Erro ao obter estatísticas: {e}")
        total_users = 0
        total_interactions = 0
    
    # Verificar se os modelos estão carregados
    models_status = {
        "species_model": model is not None,
        "face_recognition": len(known_encodings) > 0,
        "sklearn_available": True
    }
    
    return {
        "status": "healthy",
        "total_users_with_interactions": total_users,
        "total_interactions": total_interactions,
        "models_loaded": models_status,
        "available_algorithms": ["knn", "content", "collaborative", "hybrid"]
    }

@app.get("/recommendations/stats")
async def recommendations_stats():
    """Estatísticas detalhadas do sistema de recomendações"""
    try:
        conn = await asyncpg.connect(
            host=os.environ.get("POSTGRES_HOST"),
            port=int(os.environ.get("POSTGRES_PORT")),
            user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"),
            database=os.environ.get("POSTGRES_DB"),
        )
        
        # Obter todas as interações
        all_interactions_raw = await conn.fetch("SELECT action, taxon_id FROM user_species_history")
        
        if not all_interactions_raw:
            await conn.close()
            return {"message": "Sem dados de interações"}
        
        # Contar tipos de interação
        interaction_types = {}
        taxon_popularity = {}
        
        for row in all_interactions_raw:
            itype = row["action"]
            taxon_id = str(row["taxon_id"])
            
            interaction_types[itype] = interaction_types.get(itype, 0) + 1
            taxon_popularity[taxon_id] = taxon_popularity.get(taxon_id, 0) + 1
        
        # Top 10 espécies mais populares
        top_species = sorted(taxon_popularity.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Contar utilizadores únicos
        unique_users_count = await conn.fetchval("SELECT COUNT(DISTINCT user_id) FROM user_species_history")
        
        await conn.close()
        
        return {
            "total_interactions": len(all_interactions_raw),
            "unique_users": unique_users_count or 0,
            "interaction_types": interaction_types,
            "top_species": [{"taxon_id": tid, "interactions": count} for tid, count in top_species],
            "average_interactions_per_user": len(all_interactions_raw) / (unique_users_count or 1)
        }
    except Exception as e:
        print(f"Erro ao obter estatísticas: {e}")
        return {"message": "Erro ao obter estatísticas", "error": str(e)}


@app.post("/recommendations/batch_process")
async def batch_process_recommendations(user_ids: List[str], candidates: List[Dict]):
    """Processa recomendações em lote para múltiplos utilizadores"""
    results = {}
    
    for user_id in user_ids:
        try:
            # Obter preferências do utilizador baseadas no histórico (da base de dados)
            user_groups = []
            user_families = []
            seen_taxon_ids = []
            
            interactions = await get_user_interactions(user_id)
            for interaction in interactions:
                seen_taxon_ids.append(interaction["taxon_id"])
                
                # Extrair grupos e famílias das interações favoritas
                for candidate in candidates:
                    if str(candidate.get("taxon_id")) == interaction["taxon_id"]:
                        if interaction["type"] == "favorite":
                            group = candidate.get("group")
                            family = candidate.get("family")
                            if group and group not in user_groups:
                                user_groups.append(group)
                            if family and family not in user_families:
                                user_families.append(family)
            
            # Criar pedido de recomendação
            rec_request = AdvancedRecommendationRequest(
                user_id=user_id,
                user_groups=user_groups,
                user_families=user_families,
                seen_taxon_ids=list(set(seen_taxon_ids)),
                candidates=candidates,
                algorithm="hybrid",
                limit=5
            )
            
            recommendation = await advanced_recommend(rec_request)
            results[user_id] = recommendation
            
        except Exception as e:
            results[user_id] = {"error": str(e)}
    
    return {"batch_results": results}

class RecommendationFeedback(BaseModel):
    user_id: str
    recommended_taxon_id: str
    feedback_type: str  # "liked", "disliked", "not_relevant", "already_known"
    algorithm_used: str

@app.post("/recommendations/feedback")
async def record_recommendation_feedback(feedback: RecommendationFeedback):
    """Regista feedback sobre recomendações para melhorar o sistema"""
    try:
        conn = await asyncpg.connect(
            host=os.environ.get("POSTGRES_HOST"),
            port=int(os.environ.get("POSTGRES_PORT")),
            user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"),
            database=os.environ.get("POSTGRES_DB"),
        )
        
        await conn.execute(
            """INSERT INTO recommendation_feedback (user_id, recommended_taxon_id, feedback_type, algorithm_used) 
               VALUES ($1, $2, $3, $4)""",
            int(feedback.user_id), int(feedback.recommended_taxon_id), feedback.feedback_type, feedback.algorithm_used
        )
        
        await conn.close()
        return {"status": "feedback_recorded", "message": "Obrigado pelo feedback!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gravar feedback: {str(e)}")


@app.get("/recommendations/algorithm_performance")
async def get_algorithm_performance():
    """Análise de performance dos diferentes algoritmos de recomendação"""
    try:
        conn = await asyncpg.connect(
            host=os.environ.get("POSTGRES_HOST"),
            port=int(os.environ.get("POSTGRES_PORT")),
            user=os.environ.get("POSTGRES_USER"),
            password=os.environ.get("POSTGRES_PASSWORD"),
            database=os.environ.get("POSTGRES_DB"),
        )
        
        # Obter dados de feedback da base de dados
        feedback_rows = await conn.fetch(
            "SELECT algorithm_used, feedback_type, COUNT(*) as count FROM recommendation_feedback GROUP BY algorithm_used, feedback_type"
        )
        
        await conn.close()
        
        feedback_data = {}
        for row in feedback_rows:
            algorithm = row["algorithm_used"]
            feedback_type = row["feedback_type"]
            count = row["count"]
            
            if algorithm not in feedback_data:
                feedback_data[algorithm] = {"liked": 0, "disliked": 0, "not_relevant": 0, "already_known": 0}
            
            if feedback_type in feedback_data[algorithm]:
                feedback_data[algorithm][feedback_type] = count
        
        # Calcular métricas de performance
        performance_metrics = {}
        for algorithm, feedback in feedback_data.items():
            total_feedback = sum(feedback.values())
            if total_feedback > 0:
                satisfaction_rate = (feedback["liked"]) / total_feedback
                relevance_rate = (feedback["liked"] + feedback["already_known"]) / total_feedback
                performance_metrics[algorithm] = {
                    "total_feedback": total_feedback,
                    "satisfaction_rate": round(satisfaction_rate, 3),
                    "relevance_rate": round(relevance_rate, 3),
                    "feedback_breakdown": feedback
                }
        
        return {"algorithm_performance": performance_metrics}
    except Exception as e:
        return {"error": f"Erro ao obter performance dos algoritmos: {str(e)}"}


# ==========================
# SOCKET.IO APP (DEVE SER NO FINAL)
# ==========================

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Função para extrair palavras-chave de espécies do prompt
async def extract_species_keywords(prompt: str) -> list:
    """
    Extrai palavras-chave relacionadas com espécies do prompt.
    Procura nomes comuns e científicos possíveis.
    Só ativa para perguntas claramente sobre espécies naturais.
    """
    import re
    
    # Converte para minúsculas para análise
    prompt_lower = prompt.lower()
    
    # Verifica se é uma pergunta sobre espécies (não sobre identidade do bot)
    identity_questions = [
        "qual o teu nome", "quem és", "como te chamas", "qual é o teu nome",
        "who are you", "what is your name", "tell me about yourself",
        "apresenta-te", "apresenta te", "nome do bot", "identificação"
    ]
    
    for identity_q in identity_questions:
        if identity_q in prompt_lower:
            return []  # Não usar RAG para perguntas sobre identidade
    
    # Lista de palavras-chave comuns relacionadas com espécies
    species_indicators = [
        "espécie", "especie", "animal", "planta", "ave", "peixe", "mamífero", "mamifero",
        "réptil", "reptil", "anfíbio", "anfibio", "inseto", "insecto", "aranha", "árvore", "arvore",
        "flor", "pássaro", "passaro", "osga", "lagarto", "serpente", "cobra", "rato",
        "gato", "cão", "cao", "cavalo", "vaca", "ovelha", "cabra", "porco", "galinha", "pato",
        "fauna", "flora", "biodiversidade", "ecossistema", "habitat", "taxonomia",
        "lince", "lynx", "bobcat", "felino", "felidae", "pardo", "ibérico", "iberico",
        "rufus", "pardinus", "predador", "carnívoro", "carnivoro"
    ]
    
    # Procura por contexto específico de espécies
    species_context_found = any(indicator in prompt_lower for indicator in species_indicators)
    
    keywords = []
    
    # Sempre procura por palavras-chave específicas de espécies conhecidas
    specific_species_terms = [
        "lince", "lynx", "bobcat", "felino", "pardo", "ibérico", "iberico", "rufus", "pardinus",
        "lobo", "canis", "lupus", "águia", "aguia", "falcão", "falcao", "pardal", "tordo"
    ]
    
    for term in specific_species_terms:
        if term in prompt_lower:
            keywords.append(term)
    
    # Se encontrou termos específicos ou contexto geral de espécies, procura mais palavras
    if keywords or species_context_found:
        for word in species_indicators:
            if word in prompt_lower:
                keywords.append(word)
        
        # Procura por possíveis nomes científicos (duas palavras capitalizadas)
        scientific_names = re.findall(r'\b[A-Z][a-z]+ [a-z]+\b', prompt)
        keywords.extend(scientific_names)
        
        # Procura por palavras que possam ser nomes de espécies (capitalizadas isoladas)
        possible_names = re.findall(r'\b[A-Z][a-z]+\b', prompt)
        keywords.extend(possible_names)
        keywords.extend(possible_names)
    
    return list(set(keywords))  # Remove duplicados

# Função para Procurar documentos por palavras-chave na base de dados
async def search_by_keywords(keywords: list) -> list:
    """
    Procura documentos na base de dados que contenham as palavras-chave especificadas.
    Usa procura case-insensitive com regex para palavras completas.
    """
    if not keywords:
        return []
    
    conn = await asyncpg.connect(
        host=os.environ.get("POSTGRES_HOST"),
        port=int(os.environ.get("POSTGRES_PORT")),
        user=os.environ.get("POSTGRES_USER"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        database=os.environ.get("POSTGRES_DB"),
    )
    
    # Constrói query usando regex para procura de palavras completas
    keyword_conditions = []
    for keyword in keywords:
        # Escape de caracteres especiais para regex e procura por palavra completa
        escaped_keyword = keyword.replace('-', '\\-').replace('(', '\\(').replace(')', '\\)')
        keyword_conditions.append(f"content ~* '\\y{escaped_keyword}\\y'")
    
    query = f"""
        SELECT content 
        FROM documents 
        WHERE {' OR '.join(keyword_conditions)}
        LIMIT 3
    """
    
    try:
        rows = await conn.fetch(query)
        return [row["content"] for row in rows]
    except Exception as e:
        # Fallback para procura simples ILIKE se regex falhar
        try:
            simple_conditions = [f"content ILIKE '%{keyword}%'" for keyword in keywords]
            simple_query = f"""
                SELECT content 
                FROM documents 
                WHERE {' OR '.join(simple_conditions)}
                LIMIT 3
            """
            rows = await conn.fetch(simple_query)
            return [row["content"] for row in rows]
        except Exception:
            return []
    finally:
        await conn.close()

# Endpoint de teste para debug do RAG
@app.post("/test_rag")
async def test_rag(data: dict):
    """Endpoint para testar o sistema RAG diretamente"""
    query = data.get("query", "")
    if not query:
        return {"error": "Query é obrigatória"}
    
    # Verificar se é uma pergunta sobre identidade
    is_identity = is_identity_question(query)
    
    # Pesquisar documentos similares
    context_list = []
    if not is_identity:
        context_list = await search_similar_documents(query, top_k=3)
        
        # Se não encontrou nada, tentar procurar por palavras-chave
        if not context_list:
            keywords = await extract_species_keywords(query)
            if keywords:
                context_list = await search_by_keywords(keywords)
    
    return {
        "query": query,
        "is_identity": is_identity,
        "documents_found": len(context_list),
        "context": context_list[:1] if context_list else [],  # Primeiro documento apenas
        "rag_used": len(context_list) > 0
    }