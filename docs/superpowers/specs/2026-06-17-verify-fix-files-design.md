# Design — Script de vérification et correction des fichiers visuels via Gamesys

**Date :** 2026-06-17  
**Fichier cible :** `server/scripts/verifyAndFixFiles.js`  
**Rapport généré :** `server/scripts/reports/YYYY-MM-DD-verify-files.md`

---

## Objectif

Script autonome (hors application principale) qui :

1. Scanne les fichiers PDF des partages réseau (LM, CASTO, BRICO, ECOM)
2. Vérifie que la référence extraite du nom de chaque fichier existe bien dans Gamesys (`fs_stock` via ODBC)
3. Génère un rapport Markdown détaillé
4. Optionnellement, renomme les fichiers dont la référence est incorrecte en cherchant la bonne dans Gamesys (fuzzy search)

---

## Modes CLI

```bash
node server/scripts/verifyAndFixFiles.js              # rapport Markdown uniquement (défaut)
node server/scripts/verifyAndFixFiles.js --fix        # rapport + renommage interactif (confirmation console)
node server/scripts/verifyAndFixFiles.js --dry-run    # rapport + renommage simulé (aucun fichier touché)
node server/scripts/verifyAndFixFiles.js --client=LM  # filtrer une seule enseigne
```

---

## Flux d'exécution

```
config.json
    ↓
Chemins réseau par client (LM, CASTO, BRICO, ECOM)
    ↓
Glob **/*.pdf par dossier client
    ↓
Extraction ref via REF_REGEX_BY_CLIENT + format via extractFormatFromFilename
    ↓
Batch lookup fs_stock via findStockByRefs (ODBC)
    ↓
Classification par fichier :
  ✅ ok          — ref trouvée dans fs_stock
  ⚠️  noRef      — impossible d'extraire une ref du nom de fichier
  ❌ notInGamesys — ref extraite mais absente de fs_stock
    ↓
buildReport → server/scripts/reports/YYYY-MM-DD-verify-files.md
    ↓
[--fix / --dry-run]
Pour chaque ❌ : fuzzySearchRef(fileName) → 0, 1 ou N suggestions
  - 1 suggestion unique → propose renommage (console) → exécute si --fix
  - 0 ou N suggestions  → marqué "non résolu" dans le rapport
```

---

## Composants

### `scanClientFiles(client, dir) → FileEntry[]`

- Glob `**/*.pdf` dans `dir`
- Délègue à `buildFileEntries` de `referencesCheckService.js` (déjà existant)
- Retourne `[{ filePath, fileName, ref, format, client }]`

### `lookupRefsInGamesys(refs) → Map<ref, fs_stock_row>`

- Appel batch de `findStockByRefs` de `stockReferenceLookupService.js`
- Recherche sur `st_art_ref_client` ET `st_art_gencod`

### `fuzzySearchRef(fileName, client) → Suggestion[]`

- Extrait les mots-clés du nom de fichier via `getSearchTerms` de `reference.js`
- Requête SQL sur `fs_stock` : `st_lib_1_conso ILIKE` pour chaque terme (AND)
- Retourne `[{ ref: st_art_ref_client, libelle, gencod }]`
- Limité à 5 résultats max pour éviter les faux positifs

### `buildReport(results) → void`

Écrit `server/scripts/reports/YYYY-MM-DD-verify-files.md` avec :

```markdown
# Rapport de vérification fichiers visuels — 2026-06-17

## Résumé
| Client | Fichiers scannés | ✅ OK | ⚠️ Ref non extraite | ❌ Absent Gamesys |
|--------|-----------------|-------|---------------------|------------------|
| LM     | 120             | 115   | 2                   | 3                |
...

## Détail par client

### LM
#### ❌ Références absentes de Gamesys
- `MOSAIQUE 94953676 MAT.pdf` — ref extraite : `94953676`

#### ⚠️ Références non extraites
- `SANS-REF-TEST.pdf`

#### ✅ Fichiers OK : 115
```

### `applyFixes(notInGamesys, dryRun) → void`

- Pour chaque entrée `notInGamesys`, appelle `fuzzySearchRef`
- Si 1 suggestion unique :
  - Affiche : `[RENAME] ancien-nom.pdf → nouveau-nom-avec-bonne-ref.pdf`
  - Si `--fix` : exécute `fs.rename`
  - Si `--dry-run` : affiche uniquement
- Si 0 ou plusieurs suggestions : affiche `[UNRESOLVED]`, note dans le rapport

---

## Stratégie de renommage

La ref Gamesys trouvée par fuzzy search (`st_art_ref_client`) remplace la ref extraite dans le nom de fichier original. Le reste du nom est conservé tel quel.

Exemple :
```
MOSAIQUE 94953677 MAT.pdf   →   MOSAIQUE 94953676 MAT.pdf
                     ↑ typo             ↑ bonne ref Gamesys
```

Si la ref n'est pas isolable dans le nom de fichier (cas `noRef`), le fichier est marqué `noRef` dans le rapport et exclu du renommage automatique — correction manuelle requise.

---

## Chemins réseau

Lus depuis `config.json` (à la racine du projet), qui mappe les clés `LM`, `CASTO`, `BRICO`, `ECOM` vers les chemins des partages réseau. Même source que `configService.js`.

---

## Dépendances réutilisées

| Module existant | Usage |
|----------------|-------|
| `server/src/services/referencesCheckService.js` | `buildFileEntries`, `REF_REGEX_BY_CLIENT`, `extractFormatFromFilename` |
| `server/src/gamesys/services/stockReferenceLookupService.js` | `findStockByRefs` |
| `server/src/gamesys/utils/reference.js` | `getSearchTerms`, `isProfileLabel`, `isTeinteMasseModel` |
| `server/src/gamesys/config/db.js` | `checkOdbcConnection` |
| `server/src/gamesys/lib/db.js` | `query`, `closeConnection` |
| `server/src/mongoose.js` | Non nécessaire — script ODBC uniquement |

> Note : ce script ne touche pas MongoDB. Il ne compare que fichiers disque ↔ Gamesys.

---

## Exclusions (cohérence avec le code existant)

Avant toute vérification, les fichiers dont le nom contient un modèle de profil (`PROFIL`, `CORNIERE`) ou une teinte masse (`NOIR ZERO`, `BLANC ZERO`, etc.) sont ignorés — conformément à `referencesCheckService.js` et `gamesysReferencesCheckService.js`.

---

## Gestion des erreurs

- ODBC indisponible → arrêt immédiat avec message explicite (comme `compareGamesysMongo.js`)
- Dossier réseau inaccessible → log d'avertissement + client ignoré (les autres continuent)
- `fs.rename` échoue → log d'erreur + fichier marqué `[RENAME_FAILED]` dans le rapport

---

## Fichier de rapport

- Répertoire : `server/scripts/reports/` (créé automatiquement si absent)
- Nom : `YYYY-MM-DD-verify-files.md` (ou `YYYY-MM-DD-verify-files-LM.md` si `--client=LM`)
- Toujours généré, même en mode `--fix` ou `--dry-run` (le rapport inclut alors les renommages appliqués/simulés)
