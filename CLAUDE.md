# CLAUDE.md

Ce fichier fournit des indications à Claude Code (claude.ai/code) pour travailler dans ce dépôt.

## Commandes

### Développement

```bash
# Démarrer le backend (avec rechargement automatique nodemon) tout en precisant que tu es bien dev
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
# Lancer tous les tests (mocha) en confirmant toujours aue tu es bien en dev
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

Un 5e type, **PRO** (comptes clients directs/professionnels, ex : `I96`, `L558`, `CCYRILL` — pas de préfixe enseigne régulier dans `dos_client`, cf. `mapDosClientToAppClient` dans `server/src/gamesys/services/dossierService.js`), existe en base a minima : les commandes Pro obtiennent un stub `Deco`/`ConsommationCommande` (via les syncs Gamesys automatiques) et sont couvertes par les backfills, mais n'ont **pas** de pipeline job actif (pas de partage réseau/symlink, pas d'option dans le sélecteur client du frontend, pas de règles métier type crédences).

### Fichiers d'environnement

- `.env` (racine) — `PORT`, `MONGO_URL`, chemins réseau (`LINK_DECO*`, `LINK_TAURO`)
- `client/.env` — `VITE_HOST`, `VITE_PORT`, `VITE_API_GOOGLE`

Le fichier `config.json` à la racine du projet stocke les chemins réseau actifs utilisés par `configService.js` pour créer les symlinks. Il est modifiable en direct via la modale Config de l'interface.

## Règles métier — Crédences (BRICO / CASTO)

Les crédences sont des panneaux de format `300x60` (CASTO) ou `255x60` (BRICO), détectés via le regex `/^\d{3}x\d{2}$/i` sur `format_visu`.

### Règle des exemplaires

| `ex`       | Comportement                                   | 2e visuel                                          |
| ---------- | ---------------------------------------------- | -------------------------------------------------- |
| **1 ex**   | 2 visuels **différents** amalgamés côte à côte | Obligatoire — fourni par l'utilisateur             |
| **≥ 2 ex** | Même visuel amalgamé **2 fois** sur la plaque  | Auto-dupliqué par le backend (`visuel2 = visuel1`) |

- Si `ex=1` et `visuel2` absent → rejet **400** : `"Les crédences BRICO/CASTO (1 ex) doivent être amalgamées avec un 2e visuel différent."`
- Si `ex≥2` et `visuel2` absent → backend duplique automatiquement (`data.visuel2`, `visuPath2`, `visuel2`, `format2`, `matchRef2` sont tous réassignés).

### Variables critiques dans `addJob`

`visuPath2`, `visuel2` (nom nettoyé) et `format2` sont initialisées **avant** le bloc crédences → elles sont déclarées `let` et réassignées dans le bloc de duplication. Ne pas les déclarer `const`.

### Extraction du nom `deco` dans `runJobs`

- **CASTO** : partie du nom du fichier **après** le format (ex : `"CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf"` → `"MOSAIQUE"`).
- **BRICO** : partie **avant** le format (ex : `"VELTIS BRILLANT 255x60 VELTIS-25560"` → `"VELTIS BRILLANT"`).

Cette logique s'applique à `deco` ET `deco2` (le 2e panneau). `deco2` utilise `job.client` (pas `client2`) pour choisir la branche.

### Sauvegarde MongoDB (`saveDeco`)

- `ex=1`, 2 visuels différents (`cmd2 ≠ cmd`) → **2 entrées** Deco créées.
- `ex≥2`, même visuel dupliqué (`visuel === visuel2`) → **1 seule entrée** Deco (la condition `!isDuplicated` l'empêche).

### Tests de référence

- `test/integration/credences.test.js` — couvre toutes les combinaisons : rejet 400, amalgame 2 visuels différents (CASTO + BRICO), duplication automatique `ex=2`.
- Endpoint `GET /history?limit=N` disponible pour vérifier les entrées MongoDB après `run_jobs`.
