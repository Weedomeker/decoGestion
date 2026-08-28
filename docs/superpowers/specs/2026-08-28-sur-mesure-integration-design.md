# Intégration propre des panneaux sur-mesure

## Contexte / problème

L'application n'a **aucun concept de premier ordre « sur-mesure »**. Les
commandes de panneaux déco à cote client (libellé Gamesys générique
« Panneau déco sur-mesure 125x210 Finition Lisse », le vrai nom du visuel
dans `endv_ref_client` : « ARCHE BEIGE CENTRE 86.9 X 201.5 MAT ») sont
traitées implicitement, par de la logique dispersée :

- **`client/src/components/DossierAutocomplete.jsx` › `detectTeinteMasse`** —
  détection côté client, sur `libelle + reference`, contre une liste de
  8 modèles en dur (`TEINTE_MASSE_OPTIONS`). Attrape les solides
  (BLANC ZERO, NOIR ZERO…) même quand ils passent par un gabarit sur-mesure.
- **`server/src/gamesys/services/dossierService.js` › `buildVisualReferences`** —
  quand `fs_stock` n'a pas de correspondance, `reference` retombe sur
  `endv_ref_client` brut (`source: "fd_entete_devi"`), sans nettoyage.
- **`server/src/services/decoPrixVisuelBackfillService.js`** et
  **`server/src/services/profilsKitsService.js`** — chacun réimplémente sa
  propre heuristique « chercher le nom du visuel dans `endv_identif` ET
  `endv_ref_client`, désambiguïser par format et par orientation
  Gauche/Centre/Droit ».

Conséquences :

1. Le champ `deco` d'un doc `Deco` sur-mesure finit égal à la chaîne brute
   `endv_ref_client` (« ARCHE BEIGE CENTRE 86.9 X 201.5 MAT »), parce que
   `resolveRefFields` ne trouve rien dans Ref\* et que le hook laisse la
   valeur de repli.
2. Aucun moyen de filtrer / compter les sur-mesure dans l'app, alors que
   Gamesys porte le signal (`docs/gamesys suivis commandes.sql` :
   `mapping_article.sfamille = 'SMES'`, colonne « Sur mesure »).
3. « Finition Lisse » / « Texturée » du libellé n'est utilisée par aucune
   logique.
4. La cote exacte demandée par le client (souvent décimale, ex.
   `86.9 x 201.5`, parfois ≠ format du panneau) n'est ni exploitée ni
   conservée.

### Ce que Gamesys expose (vérifié en prod, 2026-08-28)

`fs_stock.st_art_sfamille = 'SMES'` : **72 lignes**, des SKU-gabarits
`MU-SM<format><finition>` (famille MURANEO) et `EC-SM<format><finition>`
(famille ECOM). Codes finition : **L**=Lisse, **T**=Texturée, **C**=Couleur,
**B**=Brossé. Le `st_lib_1_conso` du gabarit est identique au `endv_identif`
de la ligne de devis (« Panneau déco sur-mesure 100x210 Finition Lisse »).

La structure d'une ligne sur-mesure :

| Élément | Exemple (cmd 167302) | Apporte |
| --- | --- | --- |
| `endv_identif` (= libellé gabarit SMES) | `Panneau déco sur-mesure 100x210 Finition Lisse` | **format fini** du panneau (`100x210`) + **finition** (Lisse) |
| `endv_ref_client` (texte libre) | `BLANC ZERO 90 x 210 MAT` | **nom** du visuel/teinte, **orientation** éventuelle, **cote client** (`90 x 210`), marqueur MAT/BRILLANT |
| `st_art_sfamille` sur l'article stock | `SMES` | signal sur-mesure explicite |
| `dos_forme_et_format` | `Ft. fini : 1000 x 2100 mm` | confirme le format fini = `100x210` |

Gamesys considère donc lui-même que le **format fini** est `100x210`
(`dos_forme_et_format`). La cote de `endv_ref_client` (`90 x 210`,
`86.9 x 201.5`) est une **autre mesure** : la surface visible / demandée par
le client, pas le format du panneau.

« BLANC ZERO » n'existe nulle part dans `fs_stock` — la teinte n'est qu'un
texte libre dans `endv_ref_client`.

## Objectif

Faire du sur-mesure un concept explicite, avec **une seule source de vérité
côté serveur** :

- **Sur-mesure** = ligne dont l'article stock est `sfamille = 'SMES'` **ou**
  dont `endv_identif` matche le libellé gabarit. C'est la catégorie ombrelle.
- Dedans, deux sous-cas selon le contenu de `endv_ref_client` :
  - **`teinte_masse`** — le nom est une teinte masse connue (BLANC ZERO,
    NOIR ZERO, GRANIT 3, *BROSSE…). Solide : aucun fichier visuel, aucun
    traitement PDF. Comportement identique au chemin `teinteMasse` actuel.
  - **`visuel`** — un vrai visuel imprimé à cote custom (ARCHE BEIGE,
    BAMBUSA…). Fichier PDF attendu, sélection opérateur.
- **Hors catalogue Ref\* par nature** : `deco` / `finition` sont dérivés de
  Gamesys, `format` = format fini du gabarit (`100x210`). On ne crée pas
  d'entrée Ref\* par cote.
- Flag `surMesure` **stocké** sur le doc `Deco`, **visible** dans l'UI
  (badge + filtre), **exporté** (colonne CSV).
- La cote client exacte est conservée en **commentaire** (`Deco.comment`),
  pas dans un champ dédié.

### Non-objectifs (YAGNI)

- Pas de refonte du scoring de sélection de fichier pour les sur-mesure
  visuel (le sélecteur manuel actuel suffit).
- Pas d'entrées Ref\* « sur-mesure », pas de catalogue sur-mesure.
- Pas de backfill des docs `Deco` existants (l'intégration Gamesys ne
  remonte pas de façon fiable avant 2025 — sujet séparé si besoin).
- `orientation` et cote client sont stockées / affichées, **pas** utilisées
  pour piloter le calcul de plaque ou la découpe dans cette itération.
- La détection teinte-masse des lignes **non-SMES** (catalogue standard)
  n'est pas modifiée.

## Architecture

Approche retenue : **enrichissement au niveau du résolveur Gamesys**. Un
util partagé pur produit les champs structurés ; `dossierService` les pose
sur les références visuelles ; `normalizeDossierApiPayload` les propage dans
la payload API (champs **additifs**) ; le front les **consomme** au lieu de
redétecter ; `jobsController` les persiste sur `Deco`.

```
fd_entete_devi / fs_stock
        │
        ▼
surMesure.js  (util pur : détection + parsing)
        │
        ▼
dossierService.buildVisualReferences   ← pose { surMesure, surMesureKind, deco,
  (+ fetchSousDossiersVisuels)            format, finition, orientation, printFormat }
        │
        ▼
normalizeDossierApiPayload  ← propage dans visualJobs (additif)
        │
        ├────────────► client/DossierAutocomplete.buildRows  ← consomme (plus de redétection)
        │                        │
        │                        ▼
        │               client/App.jsx  ← état job + badge + filtre → POST
        │                        │
        ▼                        ▼
server/jobsController.addJob  ← lit surMesure/orientation/printFormat,
                                compose Deco.comment, persiste
        │
        ▼
models/Deco.js  ← schéma + hook (skip Ref* si surMesureKind === "visuel")

decoPrixVisuelBackfillService.js / profilsKitsService.js
        └──► réutilisent surMesure.js (suppression des heuristiques dupliquées)
```

## Composants

### 1. `server/src/gamesys/utils/surMesure.js` (nouveau)

Fonctions pures, aucune I/O. Importe `TEINTE_MASSE_MODELS` / `isTeinteMasseModel`
et `normalizeSearchText` depuis `reference.js`.

| Fonction | Entrée | Sortie |
| --- | --- | --- |
| `isSurMesureLabel(endvIdentif)` | `"Panneau déco sur-mesure 125x210 Finition Lisse"` | `boolean` — regex `/^panneau\s+d[eé]co\s+sur[-\s]?mesure\b/i` sur le libellé normalisé |
| `parseSurMesureGabarit(endvIdentif)` | idem | `{ format: "125x210", finition: "LISSE" }` |
| `parseSurMesureRefClient(endvRefClient)` | `"ARCHE BEIGE CENTRE 86.9 X 201.5 MAT"` | `{ name: "ARCHE BEIGE", orientation: "CENTRE", printFormat: "86.9x201.5", finishHint: "MAT" }` |
| `classifySurMesure({ name })` | `"BLANC ZERO"` / `"ARCHE BEIGE"` | `"teinte_masse"` / `"visuel"` |
| `canonicalTeinteMasse(name)` | `"BLANC ZERO"` | `"BLANC ZERO MAT"` — l'entrée exacte de `TEINTE_MASSE_OPTIONS` (front) / valeur attendue par `TeinteMasseDropdown` et la recherche `$text` de `jobsController`. `null` si `name` n'est pas une teinte connue |

Détails :

- **`parseSurMesureGabarit`** : `format` extrait du `(\d{2,4})\s*x\s*(\d{2,4})`
  du libellé, normalisé `<w>x<h>` (mêmes conventions que `parseFormat` de
  `dossierApiController.js` : division par 10 si > 500). `finition` = le mot
  après « Finition » (`LISSE` | `TEXTUREE` | `COULEUR` | `BROSSE`,
  dé-accentué) ; à défaut, le suffixe `L`/`T`/`C`/`B` du `st_code_tarif`
  quand une ligne stock SMES est disponible.
- **`parseSurMesureRefClient`** :
  - `orientation` : `GAUCHE` | `CENTRE` | `DROIT` (repris de
    `extractOrientationHint` dans `reference.js`, tolérant à la faute
    « DROT »). `null` si absent.
  - `printFormat` : `(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)`, séparateur
    décimal `,` → `.`, forme `<w>x<h>`. `null` si absent.
  - `name` : `endvRefClient` moins le mot d'orientation, moins la cote, moins
    le marqueur `MAT`/`BRILLANT` ; espaces compactés ; `.toUpperCase()`.
  - `finishHint` : `MAT` | `BRILLANT` | `null`.
- **`classifySurMesure`** : `isTeinteMasseModel(name)` → `"teinte_masse"`,
  sinon `"visuel"`.

### 2. `server/src/gamesys/services/dossierService.js`

**`buildVisualReferences(enteteDevis, stockVisualReferences, printFinish)`** —
pour chaque entête, détecter le sur-mesure :

- signal A : la ligne stock associée a `st_art_sfamille === 'SMES'` ;
- signal B : `isSurMesureLabel(entete.endv_identif)` (couvre le repli
  `fd_entete_devi` sans ligne stock, cas cmd 167302).

Si sur-mesure, la référence construite reçoit (en plus des champs actuels) :

```js
{
  surMesure: true,
  surMesureKind: "visuel" | "teinte_masse",   // classifySurMesure(rc)
  deco:        rc.name,          // "ARCHE BEIGE" — remplace le endv_ref_client brut
  reference:   rc.name,          // idem (cohérent avec le fallback actuel ; uniqueBy inchangé)
  format:      gab.format,       // "125x210" — format fini du gabarit
  finition:    gab.finition,     // "LISSE" | "TEXTUREE" | "COULEUR" | "BROSSE"
  orientation: rc.orientation,   // ou null
  printFormat: rc.printFormat,   // "86.9x201.5" ou null
}
```

où `gab = parseSurMesureGabarit(entete.endv_identif)` et
`rc = parseSurMesureRefClient(entete.endv_ref_client)`.

Lignes non sur-mesure : **strictement inchangées**.

**`fetchSousDossiersVisuels(connection, numero)`** (boucle allégée pour la
sync des stubs) : même enrichissement via le même util — aucune requête
supplémentaire.

### 3. `server/src/controllers/dossierApiController.js`

**`extractVisualFormat(visualRef, sousDossier)`** : quand
`visualRef.surMesure`, retourner `visualRef.format` (format fini du gabarit)
en priorité, au lieu de re-parser depuis le libellé générique.

**`normalizeDossierApiPayload`** : chaque `visualJob` gagne (tous
**additifs** — les consommateurs actuels ignorent les champs inconnus) :

| Champ | Source |
| --- | --- |
| `surMesure` | `visualRef.surMesure ?? false` |
| `surMesureKind` | `visualRef.surMesureKind ?? null` |
| `deco` | `visualRef.deco ?? null` *(non exposé aujourd'hui)* |
| `finition` | `visualRef.finition ?? null` *(non exposé aujourd'hui)* |
| `orientation` | `visualRef.orientation ?? null` |
| `printFormat` | `visualRef.printFormat ?? null` |

Le contrat de `/dossier-api/:numero` reste rétrocompatible.

### 4. `client/src/components/DossierAutocomplete.jsx`

**`buildRows(payload, pathData, formatTauro)`** — consommer les champs de la
payload :

- `job.surMesure && job.surMesureKind === "teinte_masse"` → branche
  « detectedTeinte » actuelle (aucun fichier, `teinteMasse: true`), en
  ajoutant `surMesure: true`. La valeur teinte alimentée dans la row et le
  `TeinteMasseDropdown` reste la forme canonique `"… MAT"`
  (`canonicalTeinteMasse(job.deco)`), pour ne rien changer au
  `TeinteMasseDropdown` ni à la recherche `$text` de `jobsController`. On ne
  dépend plus de `detectTeinteMasse` local sur ce cas.
- `job.surMesure && job.surMesureKind === "visuel"` → row visuel normale
  (fichier attendu, sélection manuelle), plus `surMesure: true`, avec
  `formatPath` pré-rempli depuis `job.format`. Scoring de fichier inchangé.
- **`detectTeinteMasse` conservé** comme fallback : chemin sans Gamesys
  (`gamesysOk === false`) et serveur ancien ne renvoyant pas les nouveaux
  champs.
- Les rows portent `surMesure`, `surMesureKind`, `orientation`,
  `printFormat`.

### 5. `client/src/App.jsx`

- État job + objet `checkGenerate` : ajout de `surMesure`, `orientation`,
  `printFormat`, transmis tels quels au POST `/add_job`.
- Liste des jobs : **badge « SUR-MESURE »** à côté de la puce teinte-masse
  quand `job.surMesure` ; si `printFormat`, sous-label `86,9 × 201,5`.
- En-tête de liste : toggle **« sur-mesure uniquement »** (filtre client sur
  la liste existante).
- Aucun nouveau dropdown / workflow.

### 6. `server/src/controllers/jobsController.js`

- **`addJob`** lit `req.body.surMesure`, `req.body.orientation`,
  `req.body.printFormat`.
- `surMesure && kind === "teinte_masse"` → chemin `teinteMasse` actuel
  inchangé (la row a déjà `teinteMasse: true`) : pas de vérif disque, pas de
  `modifyPdf`.
- `surMesure && kind === "visuel"` → job visuel normal + flag stocké.
- **Composition du `comment`** : si `printFormat` est présent sur une ligne
  sur-mesure, `comment = "Cote client : <w> × <h> cm"` (décimale FR). Si un
  commentaire existe déjà (ex. « Pris en stock le … »), concaténer avec
  ` — `.
- Doc `Deco` sauvé avec `surMesure`, `surMesureKind`, `orientation`
  (colonnes) ; la cote va dans `comment`.
- **Export CSV** (`jobsController.js:1287`) : ajout d'une colonne
  `surMesure` (`0`/`1`) — miroir de la colonne « Sur mesure » du SQL Gamesys.

### 7. `server/src/models/Deco.js`

Schéma — trois champs ajoutés :

```js
surMesure:     { type: Boolean, default: false },
surMesureKind: { type: String },            // "visuel" | "teinte_masse" | (vide)
orientation:   { type: String },            // GAUCHE | CENTRE | DROIT | (vide)
```

Pas de champ pour la cote client (→ `comment`). `format` reste le format
fini du panneau (blank), déjà existant.

**Hook `pre("save")` / `pre("findOneAndUpdate")`** — seul changement de
comportement d'un existant : **sauter la résolution Ref\*** uniquement quand
`surMesure === true` **et** `surMesureKind === "visuel"` (le vrai cas hors
catalogue). Sinon `resolveRefFields` ne trouve rien et écrase `finition` —
venu de Gamesys — par `""`.

Le cas `surMesureKind === "teinte_masse"` **ne** saute **pas** la résolution :
il a `teinteMasse: true` et une `matchRef` issue de la recherche `$text` sur
Ref\* (machinerie teinte-masse existante), et on veut que son `deco` reste
cohérent avec les docs teinte-masse hors-SMES (résolu depuis `RefDeco.model`).

### 8. Services aval — dédoublonnage

`server/src/services/decoPrixVisuelBackfillService.js` et
`server/src/services/profilsKitsService.js` : l'heuristique inline
« chercher le nom du visuel dans `endv_identif` ET `endv_ref_client`,
désambiguïser par orientation » est remplacée par des appels à
`parseSurMesureRefClient().name` / `.orientation` de l'util partagé.
Comportement fonctionnellement équivalent ; les tests unitaires existants
(cmd 167431 ARCHE BEIGE) servent de garde anti-régression.

## Flux de données — exemple cmd 167302 / sous-dossier 05

1. `fd_entete_devi` : `endv_identif = "Panneau déco sur-mesure 100x210 Finition Lisse"`,
   `endv_ref_client = "BLANC ZERO 90 x 210 MAT"`. Pas de ligne `fs_stock`
   (repli `fd_entete_devi`).
2. `isSurMesureLabel(endv_identif)` → `true` (signal B).
3. `parseSurMesureGabarit` → `{ format: "100x210", finition: "LISSE" }`.
4. `parseSurMesureRefClient` → `{ name: "BLANC ZERO", orientation: null,
   printFormat: "90x210", finishHint: "MAT" }`.
5. `classifySurMesure({ name: "BLANC ZERO" })` → `"teinte_masse"`.
6. `buildVisualReferences` pose : `surMesure: true`,
   `surMesureKind: "teinte_masse"`, `deco: "BLANC ZERO"`,
   `reference: "BLANC ZERO"`, `format: "100x210"`, `finition: "LISSE"`,
   `orientation: null`, `printFormat: "90x210"`.
7. `normalizeDossierApiPayload` → `visualJob` avec ces champs.
8. Front `buildRows` : `surMesureKind === "teinte_masse"` → branche teinte
   (aucun fichier), `teinteMasse: true`, `surMesure: true`, teinte affichée
   = `"BLANC ZERO"`.
9. POST `/add_job` avec `surMesure: true`, `printFormat: "90x210"`.
10. `jobsController.addJob` : chemin teinte-masse (pas de PDF),
    `comment = "Cote client : 90 × 210 cm"`, doc `Deco` `{ surMesure: true,
    surMesureKind: "teinte_masse", format: "100x210", orientation: "",
    comment: "Cote client : 90 × 210 cm" }` — `ref` = résultat de la
    recherche `$text` teinte-masse (`canonicalTeinteMasse` → `"BLANC ZERO MAT"`).
11. Hook pre-save : `surMesureKind === "teinte_masse"` (≠ `"visuel"`) → la
    résolution Ref\* s'applique normalement, `deco`/`finition` viennent de
    `RefDeco` comme pour toute teinte-masse.

Pour un sur-mesure **visuel** (ex. `ARCHE BEIGE CENTRE 86.9 X 201.5 MAT`,
finition Texturée) : étape 11 → `surMesureKind === "visuel"` → Ref\* sautée,
`deco: "ARCHE BEIGE"`, `finition: "TEXTUREE"`, `format: "125x210"`,
`orientation: "CENTRE"` conservés depuis Gamesys ;
`comment = "Cote client : 86,9 × 201,5 cm"`.

## Gestion des erreurs / cas limites

| Cas | Comportement |
| --- | --- |
| `endv_ref_client` vide sur une ligne SMES | `parseSurMesureRefClient` → `{ name: "", ... }`. `name` vide → repli sur `endv_identif` (comme aujourd'hui) ; `surMesure` reste `true`, `surMesureKind: "visuel"`, un warning est poussé dans `normalizeDossierApiPayload.warnings`. |
| Pas de cote dans `endv_ref_client` | `printFormat: null`, aucun commentaire composé. |
| Cote présente mais `=` au format fini | Commentaire composé quand même (l'opérateur veut voir la cote demandée). |
| Deux sous-dossiers sur-mesure identiques (cmd 167302 /03 et /04) | Aucun traitement spécial : deux `visualJob` distincts, deux docs `Deco`. `uniqueBy` de `buildVisualReferences` s'applique **par entête**, pas entre sous-dossiers. |
| Serveur à jour, front pas encore déployé | Front ignore les champs inconnus, `detectTeinteMasse` continue de fonctionner. |
| Front à jour, serveur pas encore déployé | `job.surMesure` absent → `buildRows` retombe sur `detectTeinteMasse` (fallback conservé). |
| `finition` non reconnue dans le libellé gabarit | `parseSurMesureGabarit.finition = ""` ; `surMesure`/`format` restent valides. |
| Ligne SMES `sfamille` mais `endv_identif` ne matche pas la regex | Signal A suffit : `surMesure: true`. Le `format`/`finition` viennent alors du `st_code_tarif` (`…-SM125X210L`). |

## Tests

| Fichier | Contenu |
| --- | --- |
| `test/unit/surMesure.test.js` *(neuf)* | `isSurMesureLabel` (positifs / négatifs) ; `parseSurMesureGabarit` (4 finitions, formes `100x210` et `100 x 210`, mm > 500) ; `parseSurMesureRefClient` (`ARCHE BEIGE CENTRE 86.9 X 201.5 MAT` ; `BLANC ZERO 90 x 210 MAT` ; sans orientation ; décimale `,` ; `endv_ref_client` vide) ; `classifySurMesure` (teinte connue vs visuel) |
| `test/integration/dossierApi.surMesure.test.js` *(neuf)* | fixtures : cmd 167302 → `visualJobs[].surMesure === true`, `surMesureKind === "teinte_masse"`, `format === "100x210"`, `finition === "LISSE"`, `printFormat === "90x210"` ; une fixture 167431-like → `surMesureKind === "visuel"`, `orientation === "CENTRE"` |
| `test/unit/decoSurMesureHook.test.js` *(neuf)* | doc `Deco` `surMesure: true` + `surMesureKind: "visuel"` avec `deco`/`finition`/`format` posés : après `save`, ces valeurs **ne sont pas** écrasées ; doc `surMesureKind: "teinte_masse"` : le hook résout via Ref\* (comme une teinte-masse) ; doc sans `surMesure` : résolution Ref\* normale (non-régression) |
| `test/unit/decoPrixVisuelBackfillService.test.js` *(existant)* | reste vert après bascule sur l'util partagé (cmd 167431 ARCHE BEIGE GAUCHE/CENTRE/DROIT) |
| `test/unit/detectTeinteMasse.test.js` *(existant)* | reste vert (fallback client non modifié) |
| `test/integration/dossierApi.teinteMasse.test.js` *(existant)* | reste vert (lignes teinte-masse **non-SMES** inchangées) |

## Fichiers touchés

**Nouveaux :**
- `server/src/gamesys/utils/surMesure.js`
- `test/unit/surMesure.test.js`
- `test/integration/dossierApi.surMesure.test.js`
- `test/unit/decoSurMesureHook.test.js`

**Modifiés :**
- `server/src/gamesys/utils/reference.js` — exporte ce qu'il faut à `surMesure.js` (probablement déjà le cas)
- `server/src/gamesys/services/dossierService.js` — `buildVisualReferences`, `fetchSousDossiersVisuels`
- `server/src/controllers/dossierApiController.js` — `extractVisualFormat`, `normalizeDossierApiPayload`
- `server/src/controllers/jobsController.js` — `addJob` (lecture body, `comment`, persistance), export CSV
- `server/src/models/Deco.js` — schéma + hooks
- `server/src/services/decoPrixVisuelBackfillService.js` — bascule sur `surMesure.js`
- `server/src/services/profilsKitsService.js` — bascule sur `surMesure.js`
- `client/src/components/DossierAutocomplete.jsx` — `buildRows`
- `client/src/App.jsx` — état job, badge, filtre

## Ordre d'implémentation suggéré

1. `surMesure.js` + `test/unit/surMesure.test.js` (isolé, TDD).
2. `dossierService.buildVisualReferences` + `dossierApiController` +
   `test/integration/dossierApi.surMesure.test.js`.
3. `Deco.js` schéma + hook + `test/unit/decoSurMesureHook.test.js`.
4. `jobsController` (body, `comment`, persistance, CSV).
5. Front : `buildRows` puis `App.jsx` (badge, filtre).
6. Bascule `decoPrixVisuelBackfillService` / `profilsKitsService` sur l'util
   partagé, vérifier les tests existants.
