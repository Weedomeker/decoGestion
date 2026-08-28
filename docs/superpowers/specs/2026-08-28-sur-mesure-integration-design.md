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
| `isSurMesureLabel(endvIdentif)` | `"Panneau déco sur-mesure 125x210 Finition Lisse"` **ou** `"Format fini : 100.0 x 255.0 cm"` | `boolean` — `true` si `/^\s*panneau\s+d[eé]co\s+sur[-\s]?mesure\b/i` **ou** `/^\s*format\s+fini\s*:/i` (libellé dé-accentué) |
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

Si sur-mesure, la référence construite reçoit **de nouveaux champs**, sans
toucher aux champs existants :

```js
{
  // ...champs actuels INCHANGÉS — dont `reference` = endv_ref_client brut
  //    (via getVisualReferenceFromEntete), pour que le uniqueBy de
  //    buildVisualReferences continue de distinguer deux orientations d'un
  //    même visuel (ex: "BAMBUSA DROITE 80 X 230" ≠ "BAMBUSA GAUCHE 100 X 230").
  surMesure: true,
  surMesureKind: "visuel" | "teinte_masse",   // classifySurMesure(rc)
  deco:        rc.name,          // "ARCHE BEIGE" — nom nettoyé (nouveau champ)
  finition:    gab.finition,     // "LISSE" | "TEXTUREE" | "COULEUR" | "BROSSE" | ""
  format:      gab.format,       // "125x210" — format fini du gabarit
  orientation: rc.orientation,   // "CENTRE" ou null
  printFormat: rc.printFormat,   // "86.9x201.5" ou null
}
```

où `gab = parseSurMesureGabarit(entete.endv_identif)` et
`rc = parseSurMesureRefClient(entete.endv_ref_client)`.

**`reference` n'est PAS réassigné** (le nettoyer collapserait deux
orientations sous la même clé `uniqueBy` et perdrait un prix). Le nom
nettoyé vit dans le nouveau champ `deco`, consommé par l'API, le front et
`jobsController` (qui alimente `Deco.deco`).

**`format`** : sur une ligne sur-mesure, `gab.format` prime sur le
`format` éventuellement déjà posé par le matching stock — sauf s'il est
vide (`parseSurMesureGabarit` n'a rien extrait), auquel cas on garde
l'existant.

Lignes non sur-mesure : **strictement inchangées**.

**Détection du libellé gabarit** — `isSurMesureLabel` couvre **deux**
formes génériques observées :
- `"Panneau déco sur-mesure 100x210 Finition Lisse"` (gabarit SMES, cmd 167302) ;
- `"Format fini : 100.0 x 255.0 cm"` (cmd 167500 BAMBUSA, cmd 167431 ARCHE BEIGE).

Le signal A (`st_art_sfamille === 'SMES'`) reste prioritaire quand une ligne
stock est disponible.

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
- `mergeIdenticalVisuals` : la clé de fusion inclut `orientation` et
  `printFormat` pour les lignes `surMesure` (deux orientations d'un même
  visuel — `reference` déjà distinct, mais `deco` nettoyé identique — ne
  doivent pas fusionner ; deux teintes masse identiques, si).
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

### 8. Services aval — `orientation` explicite

`server/src/services/decoPrixVisuelBackfillService.js` (`matchPrixVisuel`) et
`server/src/services/profilsKitsService.js` (`getPrixVisuel`) désambiguïsent
aujourd'hui les panneaux miroir par `extractOrientationHint(ref, deco)`. Pour
un **nouveau** doc `Deco` sur-mesure, `deco` = nom nettoyé (« ARCHE BEIGE »,
sans orientation) et `ref` = `deco` → `extractOrientationHint` renvoie `null`
et la désambiguïsation par prix est perdue.

Correctif minimal : les deux fonctions acceptent un paramètre optionnel
`orientation`. Quand il est fourni (nouveau doc : `doc.orientation`), il est
utilisé tel quel ; sinon repli sur `extractOrientationHint(ref, deco)`
(comportement actuel, docs anciens inchangés). `saveDeco` /
`backfillDecoPrixVisuel` / `repairDecoPrixVisuel` passent `doc.orientation`.

**Pas de remplacement** de la recherche double-champ
(`endv_identif` + `endv_ref_client`) de ces fonctions : elle est volontairement
générique (un doc `Deco` peut être catalogue *ou* sur-mesure) et la replier
sur `parseSurMesureRefClient` régresserait le cas catalogue (cmd 167637
« terrazzo gris » matché via `endv_identif`). Les heuristiques d'orientation
(`extractOrientationHint` / `labelMatchesOrientation`) sont **déjà** dans
`reference.js` et partagées — aucune duplication à retirer.

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
   `surMesureKind: "teinte_masse"`, `deco: "BLANC ZERO"` (nouveau champ ;
   `reference` reste `"BLANC ZERO 90 x 210 MAT"`), `format: "100x210"`,
   `finition: "LISSE"`, `orientation: null`, `printFormat: "90x210"`.
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
| `test/unit/surMesure.test.js` *(neuf)* | `isSurMesureLabel` (les 2 formes + négatifs) ; `parseSurMesureGabarit` (4 finitions, formes `100x210` et `100 x 210`, `Format fini : 100.0 x 255.0 cm`) ; `parseSurMesureRefClient` (`ARCHE BEIGE CENTRE 86.9 X 201.5 MAT` ; `BLANC ZERO 90 x 210 MAT` ; `BAMBUSA DROITE 80 X 230 MAT` ; sans orientation ; décimale `,` ; chaîne vide) ; `classifySurMesure` ; `canonicalTeinteMasse` |
| `test/unit/dossierService.buildVisualReferences.test.js` *(étendu)* | nouveaux cas : ligne SMES (signal A) → `surMesure`, `surMesureKind`, `deco`, `finition`, `format`, `orientation`, `printFormat` ; ligne `"Panneau déco sur-mesure …"` sans stock (signal B) ; `reference` **inchangé** (raw) ; les 2 cas BAMBUSA existants restent verts |
| `test/unit/dossierApiController.normalizeDossierApiPayload.test.js` *(étendu)* | un `visualRef` `surMesure` → `visualJob` porte `surMesure/surMesureKind/deco/finition/orientation/printFormat` ; `extractVisualFormat` renvoie `visualRef.format` quand `surMesure` |
| `test/unit/decoSurMesureHook.test.js` *(neuf)* | doc `Deco` `surMesure:true` + `surMesureKind:"visuel"` + `deco/finition/format` posés : après `save`, **non écrasés** ; `surMesureKind:"teinte_masse"` : hook résout via Ref\* ; sans `surMesure` : résolution normale (non-régression) |
| `test/unit/decoPrixVisuelBackfillService.test.js` *(étendu)* | cas neuf : `matchPrixVisuel({ …, orientation: "CENTRE" })` désambiguïse quand `deco` est nettoyé (pas d'orientation dans `deco`/`ref`) ; les cas 167431 existants restent verts |
| `test/unit/jobsList.createJob.test.js` *(étendu)* | `createJob` propage `surMesureData` sur le job |
| `test/unit/detectTeinteMasse.test.js` *(existant)* | reste vert (fallback client non modifié) |
| `test/integration/dossierApi.teinteMasse.test.js` *(existant)* | reste vert (lignes teinte-masse **non-SMES** inchangées) |

## Fichiers touchés

**Nouveaux :**
- `server/src/gamesys/utils/surMesure.js`
- `test/unit/surMesure.test.js`
- `test/unit/decoSurMesureHook.test.js`

**Modifiés :**
- `server/src/gamesys/utils/reference.js` — exporte `TEINTE_MASSE_MODELS` (aujourd'hui non exporté), `normalizeSearchText`, `isTeinteMasseModel`, `extractOrientationHint` (déjà exportés)
- `server/src/gamesys/services/dossierService.js` — `buildVisualReferences`, `fetchSousDossiersVisuels`
- `server/src/controllers/dossierApiController.js` — `extractVisualFormat`, `normalizeDossierApiPayload`
- `server/src/jobsList.js` — `createJob` : nouvel argument `surMesureData`
- `server/src/controllers/jobsController.js` — `addJob` (lecture body, appel `createJob`), `runJobs`/`saveDeco` (`comment`, persistance `surMesure`/`surMesureKind`/`orientation`, `orientation` passé à `getPrixVisuel`), export CSV
- `server/src/models/Deco.js` — schéma (3 champs) + hooks (skip Ref\* si `surMesureKind === "visuel"`)
- `server/src/services/decoPrixVisuelBackfillService.js` — `matchPrixVisuel` accepte `orientation`
- `server/src/services/profilsKitsService.js` — `getPrixVisuel` accepte `orientation`
- `client/src/components/DossierAutocomplete.jsx` — `buildRows`
- `client/src/App.jsx` — `mergeIdenticalVisuals`, 2 payloads `/add_job`, badge + filtre liste
- Tests étendus : `test/unit/dossierService.buildVisualReferences.test.js`, `test/unit/dossierApiController.normalizeDossierApiPayload.test.js`, `test/unit/decoPrixVisuelBackfillService.test.js`, `test/unit/jobsList.createJob.test.js`

## Ordre d'implémentation suggéré

1. `reference.js` (export `TEINTE_MASSE_MODELS`) + `surMesure.js` +
   `test/unit/surMesure.test.js` (isolé, TDD).
2. `dossierService.buildVisualReferences` (+ `fetchSousDossiersVisuels`) +
   tests étendus `dossierService.buildVisualReferences.test.js`.
3. `dossierApiController` (`extractVisualFormat`, `normalizeDossierApiPayload`)
   + tests étendus `dossierApiController.normalizeDossierApiPayload.test.js`.
4. `Deco.js` schéma + hook + `test/unit/decoSurMesureHook.test.js`.
5. `jobsList.createJob` + `test/unit/jobsList.createJob.test.js` étendu.
6. `jobsController` (`addJob` body + appel `createJob` ; `saveDeco` `comment`
   + persistance + `orientation` vers `getPrixVisuel` ; export CSV).
7. `decoPrixVisuelBackfillService` / `profilsKitsService` : param
   `orientation` + test étendu.
8. Front : `DossierAutocomplete.buildRows`, puis `App.jsx`
   (`mergeIdenticalVisuals`, payloads, badge, filtre).
