# Résolution de référence visuelle Gamesys — recherche par référence uniquement

## Contexte / problème

Pour dossier 166237, visuel "POSÉIDON DROITE 125x255cm" : la référence produit
réelle existe dans Gamesys (`fs_stock`, `st_modele = st_art_ref_client =
"94956918"`, `st_lib_1_conso = "POSÉIDON DROITE 125x255cm (M)"`), mais
`findStockReferences` (Priorité 3, `server/src/gamesys/services/dossierService.js`)
ne la trouve jamais.

Cause : `getSearchTerms`/`normalizeSearchText` dé-accentue le terme de
recherche ("POSÉIDON" → "POSEIDON"), mais la requête SQL compare ce terme
dé-accentué à `upper(st_lib_1_conso)` — qui, lui, reste accentué. `LIKE` ne
fait pas de correspondance insensible aux accents : "POSEIDON" ne matche
jamais "POSÉIDON".

Gamesys a deux générations de fiches stock pour ce décor : une ancienne
série non-accentuée (`poseidon gauche satin (M)`, codes `82xxxxxx`, 6
formats seulement) et une série récente accentuée (`POSÉIDON DROITE...`,
codes `949xxxxx`, tous les formats). Pour "100x255" (qui fonctionne), un
doublon de l'ancienne série existe par coïncidence et sert de point d'entrée
vers un lookup MongoDB par `{model, format}` qui corrige la référence à la
volée (`enrichRowsWithMongoRef`). Pour "125x255", aucun doublon non-accentué
n'existe : la recherche renvoie zéro ligne, le lookup Mongo n'est jamais
déclenché, et le code descend jusqu'au dernier filet de sécurité :
`getVisualReferenceFromEntete` extrait "NO CC 314188" du texte libre de la
remarque (`endv_rmq`) — le numéro de commande **client**, pas une référence
produit — et le fait passer pour une référence.

Diagnostic complet (requêtes SQL live, comparaison des deux séries stock,
confirmation MongoDB) : voir la conversation de debugging.

## Objectif

Pour les visuels, ne plus jamais dériver une "référence" d'un texte libre
non structuré (remarques, mots-clés approximatifs sur `fs_stock`). Chercher
uniquement via des identifiants structurés : référence Gamesys explicite
validée, EAN, ou clé `{model, format}` dérivée du libellé et résolue
directement dans MongoDB (la source de vérité que l'app maintient déjà).

## Approche

Scope : **visuels uniquement**. Les profils et kits de pose utilisent une
recherche par mots-clés différente (`getProfileSearchTerms`,
`isKitPoseLabel`) et ne sont pas concernés par ce bug — non touchés.

### 1. Suppression du fallback "NO CC"

Dans `server/src/gamesys/utils/reference.js`, `getVisualReferenceFromEntete`
ne tente plus d'extraire un numéro depuis `endv_rmq` via regex. Elle ne
retourne plus que `endv_ref_client` / `endv_no_modele` /
`endv_code_complet_modele` (les 3 champs de référence structurés du devis).
Un numéro de commande client n'est structurellement jamais une référence
produit — cette suppression s'applique partout où la fonction est appelée
(Priorité 1 de `findStockReferences`, et le fallback de
`buildVisualReferences`), sans changement de code supplémentaire ailleurs.

### 2. Nouvelle Priorité 3 pour les visuels : lookup MongoDB `{model, format}`

Dans `findStockReferences`, remplacer la recherche LIKE textuelle actuelle
(lignes ~194-231) par une branche conditionnelle :

- **Si `isProfileLabel(identif)`** : comportement actuel inchangé (recherche
  LIKE avec `getProfileSearchTerms`).
- **Sinon (visuel)** : dériver `model = extractModelFromIdentif(identif)` et
  `format = extractDimensionFormat(identif)` (fonctions déjà existantes,
  utilisées par `enrichRowsWithMongoRef`). Interroger MongoDB avec la même
  logique de priorité client que `enrichRowsWithMongoRef`
  (`preferredRefModel` d'abord, puis `RefDeco`/`RefEcom`/`RefBrico`/`RefCasto`
  dans l'ordre) via `{model, format}` si `format` existe, sinon `{model}`
  seul. Si un document est trouvé, construire un résultat unique
  (`reference`/`modele` = `mongoDoc.ref`, `libelle` = `identif`, autres
  champs stock absents) et le retourner. Si aucun document trouvé, retourner
  `[]` — pas de repli sur une recherche approximative.

### 3. Comportement en absence totale de référence

Si Priorité 1 (référence explicite validée), Priorité 2 (EAN) et la
nouvelle Priorité 3 échouent toutes, le visuel n'a pas de référence
(`stockReference` reste `undefined` dans `buildVisualReferences`). C'est
déjà géré côté frontend par le plan précédent
(`docs/superpowers/specs/2026-07-01-matching-pdf-par-reference-design.md`) :
la ligne reste visible avec une bannière d'avertissement, sélection manuelle
requise — pas de changement nécessaire côté client.

## Hors scope

- Profils et kits de pose (`buildProfileReferences`, `buildKitPoseReferences`,
  recherche par mots-clés `getProfileSearchTerms`) — logique différente, non
  concernée par ce bug.
- La recherche LIKE textuelle elle-même (`STOCK_SELECT`, priorités 1/2)
  n'est pas modifiée — seule la Priorité 3 pour les visuels change.
- Pas de migration/nettoyage des données Gamesys (les deux générations de
  fiches stock 82xxx/949xxx restent telles quelles) — hors de portée d'un
  changement de code applicatif.

## Effet de bord accepté

Les visuels résolus via le nouveau lookup Mongo n'auront pas de
`codeTarif`/`gencod`/`famille`/`sousFamille`/`type` (MongoDB ne stocke que
`ref`/`model`/`format`/`finition`, cf. document réel :
`{ref:"94956918", model:"POSÉIDON DROITE", format:"125x255",
finition:"Mat"}`). Sans impact fonctionnel : le scoring de sélection PDF
côté frontend (`DossierAutocomplete.jsx`, plan précédent) se base d'abord
sur `reference` (poids 1000/4), qui reste renseignée.

## Vérification

Pas de framework de test frontend/backend automatisé couvrant ce chemin
spécifique en dehors de `test/integration/*.test.js` (qui dépendent d'un
serveur HTTP live, cf. plan précédent). Vérification par script Node jetable
en process (même pattern que le diagnostic initial) :
- Dossier 166237, visuel "POSÉIDON DROITE 125x255cm" → `reference` doit
  valoir `"94956918"` (au lieu de `"314188"`).
- Dossier 166237, visuel "POSÉIDON GAUCHE 100x255cm" → `reference` doit
  rester `"94953716"` (pas de régression sur le cas qui fonctionnait déjà,
  bien qu'il emprunte maintenant un chemin différent : nouvelle Priorité 3
  au lieu de l'ancien detour par la série stock non-accentuée).
