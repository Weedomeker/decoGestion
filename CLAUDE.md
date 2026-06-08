# CLAUDE.md

Ce fichier fournit des indications à Claude Code (claude.ai/code) pour travailler dans ce dépôt.

## Commandes

### Développement

```bash
# Démarrer le backend (avec rechargement automatique nodemon)
npm run server

# Démarrer le frontend (terminal séparé)
npm run client

# Build de production
npm run build

# Démarrer le serveur en production
npm start
```

### Formatage du code

```bash
npm run format
```

### Tests

```bash
# Lancer tous les tests (mocha)
npm test

# Lancer un fichier de test spécifique
npx mocha test/<fichier>.js
```

## Architecture

Ce projet est un **monorepo** composé de deux packages Node.js distincts :

- **`/`** — Backend Express (`server/server.js`, port 8000)
- **`/client`** — Frontend React/Vite (proxy vers le port 8000 en développement)

### Backend (`server/`)

Le serveur utilise une structure CommonJS à plat :

- **`server.js`** — Point d'entrée. Initialise Express, WebSocket, MongoDB et lance `processAllPDFs` au démarrage pour tous les dossiers clients.
- **`src/services/appState.js`** — Singleton central mutable (`state`) contenant les chemins runtime, la file de jobs et la version de l'app. Tout le reste en dépend.
- **`src/services/configService.js`** — Lit/écrit `config.json` (chemins des dossiers réseau) et crée des symlinks de `server/public/<KEY>` → partage réseau.
- **`src/routes/index.js`** — Enregistre tous les modules de routes sur l'app Express.
- **`src/controllers/jobsController.js`** — Logique métier principale : modification PDF (`app.js`), génération du fichier de découpe, création de stickers, sauvegarde en base.
- **`src/models/`** — Schémas Mongoose. `Deco.js` contient des hooks pre-save qui auto-remplissent `finition`, `format` et `deco` en cherchant la référence dans `RefDeco`, `RefCasto`, `RefBrico` et `RefEcom`.
- **`src/services/websocketService.js`** — Diffuse les changements d'état des jobs à tous les clients connectés en temps réel.

**Schéma clé :** Les dossiers réseau (LM, CASTO, BRICO, ECOM, TAURO) sont montés dans `server/public/<KEY>` via des symlinks. L'objet `state.paths` centralise tous les chemins résolus utilisés partout ailleurs.

### Frontend (`client/src/`)

Application React monopage (pas de router — tout réside dans `App.jsx`) :

- **`App.jsx`** — Composant principal : contient tout l'état du formulaire et pilote tous les appels API. Tous les sous-composants reçoivent leurs données et callbacks depuis ici.
- **`components/JobsList.jsx`** — Se connecte au WebSocket pour les mises à jour en direct de la file de jobs ; affiche les jobs en attente/terminés avec une barre de progression.
- **`components/Config.jsx`** — Modale pour consulter/modifier les chemins réseau de `config.json` via `GET/POST /config`.
- **`components/DossierAutocomplete.jsx`** — Autocomplétion qui analyse le nom d'un dossier pour pré-remplir automatiquement tout le formulaire.
- **`components/PreviewDeco.jsx`** — Affiche un aperçu PDF du visuel sélectionné.
- **`CheckFormats.js`** — Utilitaire pur : vérifie que les dimensions d'un visuel tiennent dans le format de plaque Tauro et calcule la perte matière.

**Appels API :** utilisent `VITE_HOST` / `VITE_PORT` depuis `client/.env`. En développement le client appelle `http://localhost:8000` directement ; en production les fichiers buildés sont servis par Express.

### Types de clients (dossiers)

L'app gère les visuels de quatre enseignes : **LM** (Leroy Merlin), **CASTO** (Castorama), **BRICO** (Bricomarché), **ECOM** (e-commerce). Chacune est mappée à un partage réseau dans `config.json`.

### Fichiers d'environnement

- `.env` (racine) — `PORT`, `MONGO_URL`, chemins réseau (`LINK_DECO*`, `LINK_TAURO`)
- `client/.env` — `VITE_HOST`, `VITE_PORT`, `VITE_API_GOOGLE`

Le fichier `config.json` à la racine du projet stocke les chemins réseau actifs utilisés par `configService.js` pour créer les symlinks. Il est modifiable en direct via la modale Config de l'interface.