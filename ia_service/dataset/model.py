import os
import torch
from torch import nn, optim
from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader, random_split
import json

# Configurações
DATA_DIR = "train_val/Aves"
TRAIN_JSON = "train_clean.json"
VAL_JSON = "val.json"
MODEL_PATH = "species_model.pt"
LABELS_PATH = "species_classes.json"
TAXON_MAP_PATH = "species_taxon_map.json"
ANNOTATIONS_JSON = "annotations.json"
BATCH_SIZE = 32
NUM_EPOCHS = 10
NUM_WORKERS = 0
LR = 1e-3
VAL_RATIO = 0.2  # 20% para validação

# Transforms
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# Dataset
dataset = datasets.ImageFolder(DATA_DIR, transform=transform)
num_classes = len(dataset.classes)
print(f"Espécies (classes) encontradas: {num_classes}")
print(f"Lista de espécies: {dataset.classes}")

# Divide em treino/validação (80/20)
val_size = int(VAL_RATIO * len(dataset))
train_size = len(dataset) - val_size
train_ds, val_ds = random_split(dataset, [train_size, val_size])

# Gerar val.json
val_imgs = []
for idx in val_ds.indices:
    img_path, label = dataset.samples[idx]
    val_imgs.append({
        "image": os.path.relpath(img_path, DATA_DIR),
        "label": dataset.classes[label]
    })
with open(VAL_JSON, "w", encoding="utf-8") as f:
    json.dump(val_imgs, f, ensure_ascii=False, indent=2)
print(f"Ficheiro val.json criado com {len(val_imgs)} imagens.")

# Gerar train_clean.json
train_imgs = []
for idx in train_ds.indices:
    img_path, label = dataset.samples[idx]
    train_imgs.append({
        "image": os.path.relpath(img_path, DATA_DIR),
        "label": dataset.classes[label]
    })
with open(TRAIN_JSON, "w", encoding="utf-8") as f:
    json.dump(train_imgs, f, ensure_ascii=False, indent=2)
print(f"Ficheiro train_clean.json criado com {len(train_imgs)} imagens.")

# Mapping índice -> {class_name, taxon_id} usando annotations.json
with open(ANNOTATIONS_JSON, "r", encoding="utf-8") as f:
    annotations = json.load(f)

idx_to_info = []
for idx, class_name in enumerate(dataset.classes):
    # Procura taxon_id pelo nome científico (class_name)
    taxon_id = None
    for ann in annotations.values():
        if ann.get("sci_name") == class_name:
            taxon_id = ann.get("taxon_id")
            break
    idx_to_info.append({"class_name": class_name, "taxon_id": taxon_id})

with open(TAXON_MAP_PATH, "w", encoding="utf-8") as f:
    json.dump(idx_to_info, f, indent=2, ensure_ascii=False)

# Resumo
print("\nResumo do dataset:")
print(f"Total de imagens: {len(dataset)}")
print(f"Imagens de treino: {len(train_imgs)}")
print(f"Imagens de validação: {len(val_imgs)}")
print(f"Número de espécies (classes): {num_classes}")

# DataLoaders
train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS)
val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)

# Modelo (ResNet18)
model = models.resnet18(weights="IMAGENET1K_V1")
model.fc = nn.Linear(model.fc.in_features, num_classes)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=LR)

# Treino
for epoch in range(NUM_EPOCHS):
    model.train()
    running_loss = 0.0
    for imgs, labels in train_loader:
        imgs, labels = imgs.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        running_loss += loss.item() * imgs.size(0)
    avg_loss = running_loss / len(train_loader.dataset)

    # Validação
    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for imgs, labels in val_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            outputs = model(imgs)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
    val_acc = correct / total
    print(f"Época {epoch+1}/{NUM_EPOCHS} - Loss: {avg_loss:.4f} - Val Acc: {val_acc:.4f}")

# Guarda o modelo e as classes
torch.save(model, MODEL_PATH)
with open(LABELS_PATH, "w", encoding="utf-8") as f:
    json.dump(dataset.classes, f, ensure_ascii=False, indent=2)

print(f"Modelo guardado em {MODEL_PATH}")
print(f"Classes guardadas em {LABELS_PATH}")
print(f"Mapping índice->taxon_id guardado em {TAXON_MAP_PATH}")