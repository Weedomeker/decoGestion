# Matching PDF par référence uniquement — Dossier Api

## Contexte / problème

Dans `client/src/components/DossierAutocomplete.jsx`, la sélection automatique du
fichier PDF correspondant à un visuel Gamesys (flux "Dossier Api") mélange deux
types de critères dans `scoreFile()` :

- des **références produit réelles** : `job.reference`, `job.codeTarif`,
  `job.modele`, `job.articleReference` (poids 800 à 1000, via
  `referenceMatchesName`) ;
- des **heuristiques sur le nom/libellé** : présence du format dans le nom
  (+30) et présence de mots du libellé dans le nom (+8/mot).

Quand aucune référence ne matche un fichier du dossier de format (cas réel
observé : dossier **166237**, visuel "POSÉIDON DROITE 125x255cm", référence
Gamesys `314188` absente de tous les noms de fichiers du dossier
`LM/5_125x255/`), l'algorithme retombe sur les heuristiques faibles. Deux
biais s'y ajoutent :

- "DROITE" (libellé Gamesys, féminin) ne correspond jamais à "DROIT" (nom de
  fichier, masculin) → le mot directionnel n'apporte aucun point ;
- le score inclut le **chemin complet** du fichier (`file.name` contient le
  dossier), donc un fichier mal classé sur le partage réseau
  (`JASPE 100x255 DROITE JASPED-100255 MAT.pdf`, dupliqué par erreur dans
  `5_125x255/`) hérite du bonus format (+30) via le nom du dossier parent,
  et gagne le mot "DROITE" (+8).

Résultat : `JASPE 100x255 DROITE JASPED-100255 MAT.pdf` et
`POSEIDON 125x255 DROIT 94956918 MAT.pdf` finissent à égalité de score (38),
et le tri stable fait gagner JASPE (ordre alphabétique). Le mauvais fichier
est pré-sélectionné.

Diagnostic complet et preuves : voir la conversation — réexécution en
process de `dossier-api/166237` + simulation du scoring contre les fichiers
réels du partage réseau LM.

## Objectif

Le matching automatique de fichier PDF ne doit se baser **que** sur les
références produit Gamesys, jamais sur le libellé ou le format présents dans
le nom de fichier. Quand aucune référence ne matche, l'utilisateur doit être
prévenu explicitement et choisir manuellement — plutôt que de recevoir une
présélection non fiable.

## Approche

### 1. `scoreFile()` — retrait des heuristiques nom/libellé

Le score devient la somme des poids des 4 champs de référence qui matchent
(`reference` 1000, `codeTarif` 900, `modele` 850, `articleReference` 800).
Suppression du calcul `labelWords` et du bonus format (+30). Le filtre
`isDefinitelyWrongClient` (exclusion de sécurité sur EAN13/8 chiffres) est
conservé tel quel — ce n'est pas un critère de classement mais une exclusion
de fichiers structurellement impossibles pour le client.

### 2. `findFileCandidates()` — simplification

Plus de repli sur un classement par mots-clés quand aucune référence ne
matche : la fonction retourne uniquement les fichiers avec un score > 0
(donc au moins une référence matchée), triés par score décroissant. Si
aucun fichier ne matche, retourne un tableau vide.

### 3. `buildRows()` — ligne sans sélection automatique

Quand `candidates.length === 0` (aucune référence trouvée) :
- `selectedFile` / `selectedFileObject` restent vides (comportement déjà
  existant en cas de score faible — pas de changement de contrat ici) ;
- `status` distingue ce cas de "Aucun fichier local trouvé" (dossier de
  format vide/introuvable) avec un message explicite, ex.
  `"Aucune référence trouvée — sélection manuelle requise"`.

### 4. Filtre d'inclusion des lignes — ne plus les faire disparaître

Actuellement, `loadNumbers()` calcule :
```js
const validRows = rows.filter((r) => (r.formatPath || r.teinteMasse) && r.selectedFileObject);
```
Une ligne sans `selectedFileObject` (donc sans référence trouvée) est
**exclue silencieusement** du dossier chargé. Ce filtre est assoupli en
retirant la condition `&& r.selectedFileObject` : une ligne reste incluse
dès lors que son dossier de format a été résolu (`formatPath`) ou qu'il
s'agit d'une teinte masse. L'utilisateur la voit dans le tableau, avec le
menu déroulant de fichier vide, et peut choisir manuellement — ce menu
déroulant (`rowFiles` dans `App.jsx`) liste déjà tous les fichiers du
dossier de format indépendamment du scoring, aucune modification n'est donc
nécessaire côté `App.jsx`.

### 5. Message d'avertissement en amont

Dans `loadNumbers()`, après `buildRows`, les lignes sans référence trouvée
(`formatPath` présent, `selectedFileObject` vide, pas teinte masse) sont
listées dans le mécanisme d'avertissement déjà existant du composant
(`setMessage({ type: "warning", ... })`), au même titre que les erreurs de
chargement actuelles. Exemple :
`"166237 : 1 visuel sans référence trouvée — sélection manuelle requise (POSÉIDON DROITE 125x255cm)"`.

## Hors scope

- La résolution du dossier de format (`findFormatFolder`, qui compare le
  format au nom/chemin du dossier) n'est pas touchée — la demande porte sur
  le matching du **fichier produit**, pas sur la navigation par format.
- Le cas "teinte masse" (`detectTeinteMasse`) est un flux séparé qui ne
  scanne pas les fichiers physiques ; non affecté.
- L'affichage d'un badge de statut par ligne dans `App.jsx` (le champ
  `job.status` existe déjà mais n'est actuellement affiché nulle part) est
  une amélioration UX possible mais hors scope ici — la bannière globale
  suffit pour "prévenir en amont".
- Nettoyage du fichier mal classé sur le partage réseau
  (`server/public/LM/5_125x255/JASPE 100x255 DROITE JASPED-100255 MAT.pdf`) :
  action manuelle sur le partage réseau, pas un changement de code.

## Vérification

Pas de framework de test frontend dans ce repo (`client/package.json` sans
vitest/jest). Vérification par réexécution du harnais Node utilisé pour le
diagnostic (mêmes fonctions de scoring extraites, données réelles
Gamesys + fichiers réseau du dossier 166237) :
- Job "POSÉIDON GAUCHE" (réf. `94953716`) : doit toujours matcher
  `POSEIDON 100x255 GAUCHE 94953716 MAT.pdf` (match par référence, score
  1000+, non affecté par le retrait des bonus).
- Job "POSÉIDON DROITE" (réf. `314188`) : `candidates` doit être vide, plus
  de présélection erronée sur `JASPE...`.
