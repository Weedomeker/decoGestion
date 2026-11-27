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
- **`components/JobsList.jsx`** — Se connecte au WebSocket pour les mises à jour en direct de la file de jobs ; affiche les jobs en attente/terminés, avec le bandeau de progression `BarreProgression.jsx`.
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

## Règles métier — Crédences (BRICO / CASTO)

Les crédences sont des panneaux de format `300x60` (CASTO) ou `255x60` (BRICO), détectés via le regex `/^\d{3}x\d{2}$/i` sur `format_visu`.

### Règle des exemplaires

| `ex`       | Comportement                                   | 2e visuel                                          |
| ---------- | ---------------------------------------------- | -------------------------------------------------- |
| **1 ex**   | 2 visuels **différents** amalgamés côte à côte | Obligatoire — fourni par l'utilisateur             |
| **≥ 2 ex** | Même visuel amalgamé **2 fois** sur la plaque  | Auto-dupliqué par le backend (`visuel2 = visuel1`) |

- Si `ex=1` et `visuel2` absent → rejet **400** : `"Les crédences BRICO/CASTO (1 ex) doivent être amalgamées avec un 2e visuel différent."`
- Si `ex≥2` et `visuel2` absent (ou identique à `visuel`) → backend duplique automatiquement (`data.visuel2`, `visuPath2`, `visuel2`, `format2`, `matchRef2` sont tous réassignés).
- Côté job, `ex` = **nombre de plaques** (2 panneaux par plaque). En duplication, `job.panneaux` garde le nombre de panneaux commandés et `ex = ceil(panneaux / 2)` : 2 ex → 1 plaque, 3 ex → 2 plaques dont le panneau en trop part en stock (`processJob`, étiquette « STOCK »). Deco, prise en stock et étiquettes comptent en panneaux (`panneaux || ex`).

### Formats mélangés et plaque

- Un 255x60 peut s'amalgamer avec un 300x60 (CASTO a les deux dossiers `1_255x60` et `2_300x60`) : la 2e partie du formulaire propose tous les formats crédence du client.
- La plaque doit contenir l'emprise des 2 panneaux côte à côte (largeurs additionnées × plus grande longueur) : 255x60 + 300x60 → 120x300 → **150x305**. `plaqueCredences` (`client/src/utils/credence.js`) agrandit la plaque à l'appairage (auto, manuel, formulaire) ; `addJob` refuse en **400** une plaque trop petite (`server/src/utils/credencePlaque.js`), sinon le 300x60 sortait rogné à 260 cm.

### Variables critiques dans `addJob`

`visuPath2`, `visuel2` (nom nettoyé) et `format2` sont initialisées **avant** le bloc crédences → elles sont déclarées `let` et réassignées dans le bloc de duplication. Ne pas les déclarer `const`.

### Extraction du nom `deco` dans `processJob`

- **CASTO** : partie du nom du fichier **après** le format (ex : `"CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf"` → `"MOSAIQUE"`).
- **BRICO** : partie **avant** le format (ex : `"VELTIS BRILLANT 255x60 VELTIS-25560"` → `"VELTIS BRILLANT"`).

Cette logique s'applique à `deco` ET `deco2` (le 2e panneau). `deco2` utilise `job.client` (pas `client2`) pour choisir la branche.

### Sauvegarde MongoDB (`saveDeco`)

- `ex=1`, 2 visuels différents (`cmd2 ≠ cmd`) → **2 entrées** Deco créées.
- `ex≥2`, même visuel dupliqué (`visuel === visuel2`) → **1 seule entrée** Deco (la condition `!isDuplicated` l'empêche).

### Tests de référence

- `test/integration/credences.test.js` — couvre toutes les combinaisons : rejet 400, amalgame 2 visuels différents (CASTO + BRICO), duplication automatique `ex=2`.
- Endpoint `GET /history?limit=N` disponible pour vérifier les entrées MongoDB après `run_jobs`.

## Règles métier — Sur-mesure et teinte masse

- **Sur-mesure** : article Gamesys `st_art_sfamille = 'SMES'`, ou libellé `isSurMesureLabel` (`server/src/gamesys/utils/surMesure.js`). `format` = format fini du gabarit.
- **Sur-mesure imprimé** (`server/src/surMesure/`) : le PDF des créa (clé `SM` de `config.json`, dossier du mois, nom commençant par le numéro de commande) pilote les dimensions et la découpe ; Gamesys identifie et contrôle. Une page = un panneau = un job (`smPage`, `smNom`). Les créa écrivent un repère en marge de chaque page, hors format fini (« GAUCHE 1/3 », « HAUT-DROIT », « HAUT 2/4 ») : `marquesPage.js` le lit avec pdf-lib (texte dont le départ tombe dans la MediaBox seulement, Illustrator laissant celui des plans voisins). L'orientation lue relie la page à sa ligne avant tout ; sinon GAUCHE/CENTRE/DROIT dans l'ordre des pages si chaque orientation est unique, sinon la cote la plus proche, exacte d'abord (`attribuerPlaces` ; 168917 a deux GAUCHE), car l'ordre des sous-dossiers ne suit pas celui des pages. Le rang lu (« 2/3 », à défaut G<C<D) numérote le panneau, pas la position de la page (169824 : page 1 marquée « HAUT 2/2 »). Pas droit à l'erreur sur l'ordre : au moindre doute, écart `ordre` à confirmer (`doutePlace` : aucune preuve, par orientation lue ou cote exacte, contre une autre ligne non interchangeable ; `doutesOrdre` : repères absents, répétés ou contraires à l'ordre des pages). Un écart doit être confirmé (`refusJobSurMesure`). Commande à un PDF par visuel : le plus récent d'abord, puis les autres PDF complètent les lignes restantes si chaque page a la cote exacte d'une ligne (`complementPdf`) ; chaque panneau porte son `pdf`, et les noms sont renumérotés dans la commande (`numeroterPanneaux`), sinon les QR (24 caractères) seraient identiques. `smPage` reste la page dans son PDF. Une page d'un PDF « …_2ex » couvre jusqu'à 2 lignes de même cote exacte (`dupliquerExemplaires`, 169922) : un panneau par ligne, même `smPage`, `smNom` différent ; les clés de fusion (`jobExist`, `mergeIdenticalVisuals`, doublon de `baseFichierSurMesure`) portent donc sur `smNom`, pas sur `smPage`. Plusieurs jobs d'une même ligne Gamesys retombent sur une seule Deco : `ex` = somme de `smPanneaux` (`compterPanneauSurMesure`), jamais le dernier job. Vernis : nom du PDF puis `endv_ref_client`, jamais `dos_imp_1_fac_p_1`, souvent faux. Il est écrit dans `Deco.finition` (« Mat » / « Brillant ») via `job.smVernis` ; le hook Deco garde une finition fournie quand la ref est hors catalogue. Rattrapage : `server/scripts/backfillSmesFinition.js` (`endv_ref_client` seul, teinte masse exclue). Les stubs « A lancer » (decoGestion-API `creation.js`, copie `decoGamesysStubSyncService`) suivent la même règle : vernis du texte client, sinon vide. Le JPG et la miniature d'étiquette (`Apercus/`, sous le dossier du jour) viennent de la plaque, jamais du catalogue. Taille réelle dans `comment` (« Cote PDF »).
- **Noms sur-mesure** : PDF et JPG suivent les autres jobs avec le format fini réel (`baseFichierSurMesure` : `169580 - LM AMIENS - 80x210 - JARDIN SECRET GAUCHE MAT 1_EX`) ; un rang s'ajoute si deux panneaux auraient le même nom, sinon le second écraserait le premier. Ce même nom est imprimé sur la plaque : sous le panneau, ou le long du petit côté gauche pour un panneau pleine largeur (`positionLibelle`). Le `.cut` et le QR gardent `smNom` (`169580-1 LM AMIENS ...`), car le QR ne garde que 24 caractères et doit rester unique. QR et nom du `.cut` sont sans accents (`texteQr`, `nomFichierCut`), comme dans i-cut Layout : « Béton » dans le QR face à « BÉTON » dans le nom pouvait empêcher la table de trouver la découpe.
- **`SM` et `decoupeSM`** sont lus directement dans `config.json`, sans symlink : `linkFolders` échoue sans droits Windows. Un `.cut` et son PDF viennent du même `lirePanneau`, sinon les repères imprimés ne tombent pas sur ceux de la découpe.
- **Teinte masse** : 8 modèles. Liste serveur `TEINTE_MASSE_MODELS` (`gamesys/utils/reference.js`), à garder alignée avec `TeinteMasseDropdown.jsx` et `TEINTE_MASSE_OPTIONS` (`DossierAutocomplete.jsx`). Ni fichier source ni PDF : JPG et étiquettes seulement.

## Règles de sortie

- **PDF** : produit dans un dossier temporaire et déposé en dernier dans le hot folder (`deliverToHotFolder`), après contrôle du PDF et du JPG. Le RIP consomme le fichier à l'arrivée : ne jamais le relire ni le vérifier sur place.
- **Bandes d'encrage** (`server/src/utils/bandesEncrage.js`, case cochée par défaut, `job.bandes`, absent = vrai) : sur un visuel clair, les buses foncées manquent d'encre et repères et nom sortent flous. Standards et crédences seulement. Le chariot longe le grand côté, donc une bande sur chaque petit côté (marge ≥ 20 mm), continue et collée au fond perdu sur 4 mm (6 mm de blanc avant un repère) ; renfort bleu 5-13 mm hors repères et nom, remplacé dès 86 mm par une bande de 50 mm derrière les repères. Rien sur les grands côtés (autres lignes que les repères). Teintes CMJN de l'atelier. Repères et nom en K pur (`NOIR`), jamais en RVB : il se sépare en quatre encres.
- **JPG avec blanc** : les PDF « +BLANC » ont une encre `Separation/WHITE` affichée en magenta. Pour un job `prodBlanc`, `pdfToimg` rend le JPG et la miniature sans elle (Ghostscript `tiffsep`, puis C, M, J, N recomposés ; `GHOSTSCRIPT` ou `gswin64c` requis, sinon repli sur le rendu rose). Le PDF n'est que lu : le blanc part à l'impression. Les autres encres d'accompagnement disparaissent aussi de l'aperçu.
- **Espace disque** : `runJobs` refuse en **507** (`DISQUE_PLEIN`) une file dont les PDF ne tiendraient pas (`controlerEspaceDisque`). Un PDF de sortie pèse autant que sa source ; le temporaire compte deux fois les plus gros PDF traités en parallèle (ImageMagick copie le PDF entier pour le JPG, `MAGICK_TEMPORARY_PATH` le déplace), la sortie tous les PDF, cumulés s'ils sont sur le même disque, plus 512 Mo de marge. Un partage injoignable n'est pas bloqué ici. En dev seulement, si `sortieDevSecours` est renseigné dans `config.json` (propre au poste, jamais en production), temporaires et sortie basculent sur ce dossier au lieu d'un refus.
- **Arrêt propre** : Ctrl+C / SIGTERM (`arretPropre.js`) ferme le HTTP, puis `closeQueue` laisse finir les jobs en cours, puis vide le journal et déconnecte Mongo ; second signal ou plus de 10 min = sortie forcée. Fermer la fenêtre coupe tout (cas ci-dessous).
- **Arrêt pendant un traitement** : au démarrage, `retirerJobsOrphelins` retire de Redis les jobs restés en attente ou en cours avant de lancer le worker, qui les traiterait sinon sans étiquettes ni file (un job en cours pourrait déposer son PDF deux fois). Ils sont logués et affichés dans la File (`state.repriseArret` via `GET /jobs`, ⚠ sur l'onglet) jusqu'à « Vu » (`DELETE /reprise_arret`) : en cours = à vérifier dans Asanti.
- **Progression de la File** (`server/src/utils/progression.js`, `progressionService.js`, `client/src/components/BarreProgression.jsx`) : ne compte que le lancement en cours ; chaque job pèse sa durée probable (taille du PDF source), ses étapes (`pdf`, `jpg`, `depot`, `base`) et le temps le font avancer, jamais en recul, 100 % après les étiquettes (`end` part après elles). Durées mesurées en production, à revoir si le poste ou le réseau change. Le navigateur prolonge la barre entre deux messages (`vitesse`, `plafond`), un gros PDF bloquant la boucle d'événements. Le suivi n'échoue jamais un job (`protege`). Tout retour anticipé de `processJob` appelle `progression.echec`, sinon BullMQ le voit réussi (« Non traité »). `GET /jobs` exclut des jobs en attente ceux déjà traités. Bandeau : 44 px et même place dans tous les états.
- **Étiquettes** : une par panneau, numérotées par commande (`planEtiquettes`) ; les panneaux stock sont hors total. Sur-mesure : numéro = rang du panneau (rang de `smNom`, sinon `smPage`), jamais l'ordre de fin des jobs, qui tournent en parallèle.
- **Modèles d'étiquettes** (`server/src/stickers/`, collections `StickerModele` / `StickerImage`) : A6 en mm, rendu vectoriel `renderSticker` ; un seul modèle par défaut par enseigne, utilisé par les jobs (amorcé au démarrage depuis `modelesParDefaut.js`). Sans modèle ou si le rendu échoue, repli sur l'ancienne notice PDF (`etiquetteNotice`). L'éditeur de l'onglet Sticker (`client/src/components/sticker/geometrie.js`) reproduit les règles de rendu du serveur : garder les deux alignés. Une miniature imposée (aperçu choisi ou fichier importé, `stickers/miniatureForcee.js`) vaut pour l'étiquette rapide seulement, jamais dans un modèle : un modèle par défaut l'imprimerait sur toutes les étiquettes des jobs.
- **Découpe** (`.cut`, `.dxf`, `.svg`) : LM et ECOM uniquement. Exception : un sur-mesure imprimé, toutes enseignes, a un `.cut` nommé comme le panneau dans `decoupeSM` (en dev : `PRINTSA#<date>/Cut` en local, via `state.paths.sortieDecoupeSM`), écrit avant le dépôt du PDF ; son échec bloque le dépôt. Repères, contour, chutes et Offset suivent i-cut Layout (comparé à ~200 `.cut` de `P:\__iCut Layout`) : chutes à 10 mm du contour, et dès 30 mm de marge, chutes transversales en tronçons de 765 mm au plus (`imposer`).
- **Sessions Tauro** (`server/src/tauro/`, `POST /tauro/plan`, `run_jobs` avec `mode` session / hors-session) : `regles-tauro.js` et `lancement-tauro.js` sont copiés du dossier « session Tauro Asanti » ; garder les deux versions alignées (ajouts ici : `l.cle`, `clesJournal`, `mode`, `nomOrigine`). Mat = 50 ex. exactement, Brillant ≥ 20, ~50, ≤ 60 par défaut, réglables dans l'aperçu pour un lancement (`taille` : `exMat`, `minBrillant`, `maxBrillant`, entiers 1 à 100, comptés dans l'empreinte) ; le reste demeure dans la file. Le nom Tauro (`011_S1711A_151x260_W_MAT_169034_..._4.pdf`) ne s'applique qu'au PDF déposé et au préfixe du JPG (`S1711A-011 ...`, nom et titre imprimé en haut du JPG) : `fileName`, texte imprimé, étiquettes, vernis et `.cut` ne changent pas ; les noms vont sur des copies des jobs. Étiquettes dans l'ordre d'impression. Teinte masse en session : comptée dans les ex., n° d'ordre rangé comme un PDF (le RIP saute ce n°), inscrite au journal après son JPG (`inscrireSansPdf`), faute de dépôt ; hors session, et stock toujours, hors décompte, partis avec le lancement. Journal Mongo `LancementTauro` (lettre et n° continus sur la journée ; hors session n'en consomme pas ; ligne déjà lancée bloquée sauf « Relancer »). Dépôt exclusif (`COPYFILE_EXCL`), « déjà présent » = `UnrecoverableError` sans nouvelle tentative, garde mémoire + journal contre le double dépôt. `run_jobs` recalcule le plan et répond **409** `PLAN_CHANGE` si l'empreinte diffère de l'aperçu ; un seul lancement à la fois. Accès au journal avec `withMongoRetry` (courts pour l'aperçu).
- **Ordre de dépôt des sessions** (`server/src/tauro/fileDepot.js`) : Asanti numérote les jobs dans leur ordre d'arrivée et « Select all » → « Add to Queue » sur la Tauro suit ce numéro, pas le tri par nom. Si `attenteTauro` est renseigné dans `config.json` (lu sans symlink, vide = dépôt direct), chaque PDF de session est copié dans `<attenteTauro>/<PRINTSA#…>` (`/dev/` en dev) puis le job se termine ; un dépositeur unique les envoie au hot folder dans l'ordre `ordreTauro` (`deposerDepuisAttente`, même garde contre le double dépôt). Un job relancé garde sa place ; un job jamais prêt (`surFin` d'`enqueueRun`) est sauté ; 3 essais puis arrêt de la file, les PDF restants restent dans l'attente. Étiquettes après `vider()`. Teinte masse, stock et hors session hors de la file. Chaque PDF d'attente a sa fiche (`.json`, le job, écrite avant le PDF, lui-même copié en `.part` puis renommé) : les PDF non déposés (arrêt de la file, ou trouvés au démarrage) vont dans `state.depotsEnAttente` (`GET /jobs`), affichés dans la File (`AlerteDepotsEnAttente`) avec « Reprendre le dépôt » (`POST /tauro/reprendre_depot`, `reprendreDepot`, sous le verrou de traitement). Les jobs ne reviennent pas dans la file : les relancer imprimerait deux fois. « Déjà présent » retire le PDF et sa fiche de l'attente.

## Frontière avec decoGestion-API

La synchro Gamesys → Mongo (stubs « A lancer », annulations, compléments) et les statuts d'atelier sont dans `../decoGestion-API`. decoGestion lit Gamesys seulement pour le pré-remplissage et l'enregistrement d'un job. Tout statut posé ici l'est avec sa date dans `statusDates`, sinon il est recalculé là-bas. Les utilitaires `reference`, `surMesure`, `clientCatalogue` et `coteClient` y sont copiés : garder les deux versions alignées.

## Cahier des charges

`docs/cahier-des-charges/cahier-des-charges.html` est la source du PDF de référence. Tout changement de règle métier, de sortie, de schéma Mongo ou de lecture Gamesys le met à jour, puis régénère le PDF (`*.pdf` est ignoré par git) :

```bash
cd docs/cahier-des-charges
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$(pwd -W)/Cahier-des-charges-decoGestion.pdf" "file:///$(pwd -W)/cahier-des-charges.html"
```

Rédiger en termes simples, pour des lecteurs non développeurs : effet pour l'utilisateur d'abord, exemples de noms de fichiers plutôt que regex. Le détail technique reste dans les sections 9 et 10 et les annexes.
