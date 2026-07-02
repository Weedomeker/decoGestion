# Déploiement — Déco Gestion

## Prérequis

- **Node.js** ≥ 20
- **Docker Desktop** (pour Redis + optionnellement l'app)
- **Git**
- Accès aux partages réseau NAS (`\\NASSYNORS1221\...`) et Tauro (`\\192.168.1.72\...`)
- Accès MongoDB Atlas (`mongodb+srv://...@orphea.fhezp.mongodb.net/`)
- Driver ODBC PostgreSQL configuré (DSN `PostgreSQL35W` → srv-bd:5434/printsa)

---

## 1. Récupérer le code

```bash
git clone https://github.com/Weedomeker/decoGestion.git
cd decoGestion
git checkout main
```

---

## 2. Installer les dépendances

```bash
# Backend
npm install

# Frontend
cd client && npm install && cd ..
```

---

## 3. Configurer les fichiers d'environnement

### `.env` (racine — backend)

Créer à partir de l'exemple ci-dessous et adapter les chemins réseau :

```env
HOST=localhost
PORT=8000

# PostgreSQL ODBC
ODBC_DSN=PostgreSQL35W
DB_USER=u_odbc
DB_PASSWORD=efi

# MongoDB Atlas
MONGO_URL=mongodb+srv://<user>:<password>@orphea.fhezp.mongodb.net/

# Partages réseau (mis à jour via l'interface Config de l'app)
LINK_DECO=\\NASSYNORS1221\agence\1-décokin\ DECO-K-IN\...
LINK_TAURO=\\192.168.1.72\HotFolderRoot

# Redis (Docker)
REDIS_URL=redis://localhost:6379
```

### `client/.env` (frontend)

```env
VITE_HOST=localhost
VITE_PORT=8000
VITE_API_GOOGLE=<clé_google_maps>
```

---

## 4. Builder le frontend

```bash
npm run build
```

Le build est généré dans `client/dist/`. Il est servi automatiquement par Express en production.

---

## 5. Lancer avec Docker (recommandé en production)

Le `docker-compose.yml` orchestre **Redis** + **l'application** dans deux conteneurs.

### Première fois (ou après mise à jour du code)

```bash
# Builder l'image de l'app
docker compose build

# Démarrer tous les services en arrière-plan
docker compose up -d
```

### Mises à jour suivantes

```bash
git pull origin main
npm run build
docker compose build app
docker compose up -d --no-deps app
```

### Vérifier que tout tourne

```bash
docker compose ps
docker compose logs -f app
```

### Arrêter

```bash
docker compose down
```

> **Note volumes :** `server/public/` est monté en volume pour que les symlinks vers les partages réseau survivent aux redémarrages du conteneur.

---

## 6. Lancer sans Docker (développement / dépannage)

En développement Redis est lancé seul via Docker, l'app tourne en dehors :

```bash
# Terminal 1 — Redis uniquement
docker compose up redis -d

# Terminal 2 — Backend (nodemon)
npm run server

# Terminal 3 — Frontend (Vite dev server)
npm run client
```

---

## 6. Accès à l'application

| URL | Description |
|---|---|
| `http://localhost:8000` | Interface principale |
| `http://localhost:8000/bull-board` | File de jobs BullMQ |
| `http://localhost:8000/public/<KEY>/` | Explorateur des partages réseau via symlinks |

---

## 7. Vérifications post-déploiement

1. **Symlinks réseau** — Ouvrir la modale **Config**, vérifier que les chemins sont corrects, cliquer Valider (recréé les symlinks)
2. **Statut réseau** — Le badge serveur en haut de l'interface doit afficher tous les partages en vert
3. **Bull Board** — `http://localhost:8000/bull-board` — vérifier qu'aucun job n'est en erreur
4. **MongoDB** — Les commandes récentes doivent apparaître dans l'historique de l'interface

---

## 8. Schéma de démarrage

```
Docker compose up
    ├── redis:7-alpine  →  port 6379 (persistance AOF)
    └── app (node:20-alpine)
            ├── linkFolders()    — crée les symlinks réseau
            ├── checkNetworkPaths() — teste l'accès NAS/Tauro
            └── processAllPDFs() — génère les aperçus JPG
```

---

## 9. Commandes utiles

```bash
# Voir les logs en direct
docker compose logs -f

# Redémarrer uniquement l'app (sans toucher Redis)
docker compose restart app

# Supprimer les conteneurs ET les volumes (⚠️ efface les données Redis)
docker compose down -v

# Lancer les tests (hors Docker)
npm test
```
