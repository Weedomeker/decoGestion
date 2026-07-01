# Matching PDF par référence uniquement (Dossier Api) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que la sélection automatique du fichier PDF (flux "Dossier Api") ne se base plus que sur les références produit Gamesys (`reference`, `codeTarif`, `modele`, `articleReference`), plus jamais sur le libellé ou le format présents dans le nom de fichier, et prévenir explicitement l'utilisateur quand une sélection manuelle est nécessaire.

**Architecture:** Un seul composant est concerné, `client/src/components/DossierAutocomplete.jsx`. Trois fonctions pures (`scoreFile`, `findFileCandidates`, `buildRows`) et la logique de chargement (`loadNumbers`) y sont modifiées. Aucun autre fichier n'est touché : le menu déroulant de sélection manuelle dans `App.jsx` fonctionne déjà indépendamment du scoring (`rowFiles` liste tous les fichiers du dossier de format, pas seulement les candidats scorés).

**Tech Stack:** React (client, Vite), JavaScript pur pour la logique de matching. Pas de framework de test frontend dans ce repo (`client/package.json` sans vitest/jest) — vérification via un script Node jetable qui reproduit fidèlement les fonctions modifiées contre un jeu de données fixe (issu du cas réel dossier 166237).

## Global Constraints

- Le matching automatique de fichier ne doit utiliser QUE les 4 champs de référence Gamesys (`reference`, `codeTarif`, `modele`, `articleReference`) comparés via `referenceMatchesName` — aucun bonus basé sur le libellé ou le format du nom de fichier.
- Le filtre `isDefinitelyWrongClient` (exclusion EAN13/8 chiffres) reste inchangé — ce n'est pas un critère de classement mais une exclusion de sécurité.
- Quand aucune référence ne matche un fichier, la ligne du visuel doit rester visible dans le tableau (pas de disparition silencieuse) avec un statut et un message d'avertissement explicites, pour permettre une sélection manuelle.
- `findFormatFolder` (résolution du dossier de format) et `detectTeinteMasse` (flux teinte masse) ne sont pas modifiés — hors scope.
- Aucun nouveau fichier ni nouvelle dépendance ne doit être introduit dans `client/`.

---

### Task 1: Scoring 100% référence dans `scoreFile()` / `findFileCandidates()`

**Files:**
- Modify: `client/src/components/DossierAutocomplete.jsx:56-94`

**Interfaces:**
- Consumes : rien de nouveau — utilise les fonctions déjà existantes plus haut dans le fichier : `normalizeText(value)` (retourne `string`), `referenceMatchesName(ref, filename)` (retourne `boolean`), `isDefinitelyWrongClient` (importé de `../utils/referenceValidation`, retourne `boolean`).
- Produces : `scoreFile(file, job, client)` retourne un `number` (0 si aucune référence ne matche, sinon somme de poids parmi `{1000, 900, 850, 800}`). `findFileCandidates(files, job, client)` retourne un tableau d'objets `{...file, score}` triés par score décroissant, uniquement ceux avec `score > 0`, limité à 10. Ces deux signatures sont inchangées par rapport à l'existant — seul le contenu interne change. `buildRows` (Task 2) et `loadNumbers` (Task 3) consomment `findFileCandidates` tel quel.

- [ ] **Step 1: Écrire le script de vérification jetable qui reproduit le bug ET la correction**

Ce repo n'a pas de framework de test frontend ; on utilise un script Node autonome (non committé) qui copie fidèlement les fonctions concernées, avec un jeu de données minimal reproduisant le cas réel du dossier 166237 (visuel "POSÉIDON DROITE 125x255cm", référence Gamesys `314188` absente des noms de fichiers, fichier mal classé `JASPE ... DROITE ...` présent dans le dossier `125x255`).

Créer `C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion\server\_verify_scoring.js` :

```js
const assert = require("assert");

// --- Copie de client/src/utils/referenceValidation.js ---
function isDefinitelyWrongClient(fileName, client) {
  const name = fileName.split(/[\\/]/).pop();
  const hasEAN13 = /(?<!\d)\d{13}(?!\d)/.test(name);
  const has8digit = /(?<!\d)\d{8}(?!\d)/.test(name);
  if (hasEAN13 && client !== "CASTO") return true;
  if (has8digit && !hasEAN13 && client !== "LM") return true;
  return false;
}

// --- Copie de client/src/components/DossierAutocomplete.jsx (APRES modification Task 1) ---
function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
function referenceMatchesName(ref, filename) {
  if (!ref || !filename) return false;
  const r = normalizeText(ref);
  const n = normalizeText(filename);
  if (n.includes(r)) return true;
  const rs = r.replace(/[-_.\s]/g, "");
  return rs.length >= 4 && n.replace(/[-_.\s]/g, "").includes(rs);
}
function scoreFile(file, job, client) {
  const rawName = (file?.name || "").split(/[\\/]/).pop();
  if (isDefinitelyWrongClient(rawName, client)) return -Infinity;
  let score = 0;
  if (referenceMatchesName(job.reference, file?.name)) score += 1000;
  if (referenceMatchesName(job.codeTarif, file?.name)) score += 900;
  if (referenceMatchesName(job.modele, file?.name)) score += 850;
  if (referenceMatchesName(job.articleReference, file?.name)) score += 800;
  return score;
}
function findFileCandidates(files, job, client) {
  return files
    .map((file) => ({ ...file, score: scoreFile(file, job, client) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// --- Fixture : cas réel dossier 166237 (client LM) ---
const client = "LM";

const job1 = {
  reference: "94953716",
  codeTarif: "LM-DKI-100X255",
  modele: "94953716",
  articleReference: "94953716",
  libelle: "POSÉIDON GAUCHE 100x255cm",
  formatVisu: "100x255",
};
const filesJob1 = [
  { name: "server/public/LM/4_100x255/ACIER 100x255 94963978 MAT.pdf" },
  { name: "server/public/LM/4_100x255/POSEIDON 100x255 DROIT 94953708 MAT.pdf" },
  { name: "server/public/LM/4_100x255/POSEIDON 100x255 GAUCHE 94953716 MAT.pdf" },
];

const job2 = {
  reference: "314188",
  codeTarif: "",
  modele: "",
  articleReference: "",
  libelle: "POSÉIDON DROITE 125x255cm",
  formatVisu: "125x255",
};
// Ordre identique à un listage alphabétique réel : JASPE avant POSEIDON.
// Le fichier JASPE est mal classé sur le partage réseau (nom "100x255" mais
// physiquement présent dans le dossier 125x255) — c'est lui qui gagnait à
// tort avec l'ancien scoring par mots-clés/format.
const filesJob2 = [
  { name: "server/public/LM/5_125x255/ACIER 125x255 94953545 MAT.pdf" },
  { name: "server/public/LM/5_125x255/JASPE 100x255 DROITE JASPED-100255 MAT.pdf" },
  { name: "server/public/LM/5_125x255/POSEIDON 125x255 DROIT 94956918 MAT.pdf" },
  { name: "server/public/LM/5_125x255/POSEIDON 125x255 GAUCHE 94964019 MAT.pdf" },
];

// --- Assertions ---
const candidates1 = findFileCandidates(filesJob1, job1, client);
assert.strictEqual(candidates1.length, 1, `job1: attendu 1 candidat, obtenu ${candidates1.length}`);
assert.strictEqual(
  candidates1[0].name,
  "server/public/LM/4_100x255/POSEIDON 100x255 GAUCHE 94953716 MAT.pdf",
  "job1: mauvais fichier sélectionné",
);
assert.strictEqual(candidates1[0].score, 2650, `job1: score attendu 2650, obtenu ${candidates1[0].score}`);

const candidates2 = findFileCandidates(filesJob2, job2, client);
assert.strictEqual(
  candidates2.length,
  0,
  `job2: attendu 0 candidat (référence 314188 introuvable dans les noms), obtenu ${candidates2.length} — fichier gagnant : ${candidates2[0]?.name}`,
);

console.log("OK — job1 matche par référence, job2 n'a plus de présélection erronée (JASPE éliminé).");
```

- [ ] **Step 2: Lancer le script pour vérifier qu'il échoue sur la version actuelle du fichier**

Le script ci-dessus contient déjà la version CORRIGÉE des fonctions (celle qu'on va écrire dans `DossierAutocomplete.jsx`). Il ne dépend pas du fichier `.jsx` (il en est une copie fidèle), donc il passe indépendamment de l'état du fichier réel. Pour confirmer qu'il détecte bien une régression, lance-le une première fois en y collant temporairement l'ANCIENNE version de `scoreFile`/`findFileCandidates` (avec `labelWords` et le bonus format, cf. `DossierAutocomplete.jsx:56-94` avant modification) :

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && node server/_verify_scoring.js`

Expected (avec l'ancienne logique collée temporairement) : `AssertionError` sur `job2: attendu 0 candidat ... — fichier gagnant : server/public/LM/5_125x255/JASPE 100x255 DROITE JASPED-100255 MAT.pdf`

Remets ensuite la version corrigée (celle du Step 1) dans le script avant de continuer.

- [ ] **Step 3: Modifier `scoreFile()` et `findFileCandidates()` dans le fichier réel**

Dans `client/src/components/DossierAutocomplete.jsx`, remplace (lignes 56-94) :

```js
function scoreFile(file, job, client) {
  const rawName = (file?.name || "").split(/[\\/]/).pop();
  if (isDefinitelyWrongClient(rawName, client)) return -Infinity;

  const name = normalizeText(file?.name);
  const labelWords = normalizeText(job.libelle)
    .split(/\s+/)
    .filter((word) => word.length > 3 && !/^\d/.test(word));

  let score = 0;
  if (referenceMatchesName(job.reference, file?.name)) score += 1000;
  if (referenceMatchesName(job.codeTarif, file?.name)) score += 900;
  if (referenceMatchesName(job.modele, file?.name)) score += 850;
  if (referenceMatchesName(job.articleReference, file?.name)) score += 800;
  if (job.formatVisu && name.includes(formatToken(job.formatVisu))) score += 30;
  score += labelWords.filter((word) => name.includes(word)).length * 8;

  return score;
}

function findFileCandidates(files, job, client) {
  const scored = files
    .map((file) => ({ ...file, score: scoreFile(file, job, client) }))
    .filter((f) => isFinite(f.score));

  // Les références priment : si un fichier correspond à une référence, ne retourner que ceux-là.
  const refMatches = scored.filter(
    (f) =>
      referenceMatchesName(job.reference, f.name) ||
      referenceMatchesName(job.codeTarif, f.name) ||
      referenceMatchesName(job.modele, f.name) ||
      referenceMatchesName(job.articleReference, f.name)
  );
  if (refMatches.length > 0) {
    return refMatches.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  return scored.filter((f) => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
}
```

par :

```js
// Le matching ne se base QUE sur les références produit Gamesys (reference,
// codeTarif, modele, articleReference) — jamais sur le libellé ou le format
// présents dans le nom de fichier, pour éviter qu'un fichier mal classé ou
// une coïncidence de mots ne gagne un fichier sans lien réel avec le visuel.
function scoreFile(file, job, client) {
  const rawName = (file?.name || "").split(/[\\/]/).pop();
  if (isDefinitelyWrongClient(rawName, client)) return -Infinity;

  let score = 0;
  if (referenceMatchesName(job.reference, file?.name)) score += 1000;
  if (referenceMatchesName(job.codeTarif, file?.name)) score += 900;
  if (referenceMatchesName(job.modele, file?.name)) score += 850;
  if (referenceMatchesName(job.articleReference, file?.name)) score += 800;

  return score;
}

function findFileCandidates(files, job, client) {
  return files
    .map((file) => ({ ...file, score: scoreFile(file, job, client) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
```

Note : `formatToken` reste utilisé ailleurs dans le fichier (`findFormatFolder`, `findFormatTauro`) — ne pas le supprimer, seulement son usage dans `scoreFile`.

- [ ] **Step 4: Relancer le script de vérification pour confirmer que le fix fonctionne**

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && node server/_verify_scoring.js`

Expected: `OK — job1 matche par référence, job2 n'a plus de présélection erronée (JASPE éliminé).` (exit code 0)

- [ ] **Step 5: Supprimer le script jetable**

Run: `rm "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion\server\_verify_scoring.js"`

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion"
git add client/src/components/DossierAutocomplete.jsx
git commit -m "$(cat <<'EOF'
fix: matching PDF base uniquement sur les references Gamesys

scoreFile() ne prend plus en compte le libelle ni le format presents dans
le nom de fichier. Un fichier mal classe sur le partage reseau ou une
coincidence de mots ne peut plus faire gagner un fichier sans rapport reel
avec le visuel (cas reel : dossier 166237, JASPE... selectionne a tort au
lieu de POSEIDON...DROIT...).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Distinguer le statut "aucune référence trouvée" dans `buildRows()`

**Files:**
- Modify: `client/src/components/DossierAutocomplete.jsx:181-217`

**Interfaces:**
- Consumes : `findFileCandidates(files, job, client)` de Task 1 (retourne `[]` si aucune référence ne matche, même quand `files.length > 0`).
- Produces : l'objet ligne retourné par `buildRows` gagne une valeur possible supplémentaire pour `status` : `"Aucune référence trouvée — sélection manuelle requise"`, utilisée en Task 3.

- [ ] **Step 1: Modifier la logique de statut**

Dans `client/src/components/DossierAutocomplete.jsx`, remplace (lignes 210-216) :

```js
      status: !formatTauroValue
        ? "Format Tauro requis"
        : candidates.length === 0
          ? "Aucun fichier local trouvé"
          : hasStrongMatch
            ? "Prêt"
            : "Choix requis",
```

par :

```js
      status: !formatTauroValue
        ? "Format Tauro requis"
        : files.length === 0
          ? "Aucun fichier local trouvé"
          : candidates.length === 0
            ? "Aucune référence trouvée — sélection manuelle requise"
            : hasStrongMatch
              ? "Prêt"
              : "Choix requis",
```

Ceci distingue désormais deux cas auparavant confondus sous "Aucun fichier local trouvé" : le dossier de format est vide/introuvable (`files.length === 0`) versus des fichiers existent mais aucun ne matche une référence (`candidates.length === 0` avec `files.length > 0`).

- [ ] **Step 2: Vérifier visuellement dans le fichier**

Relis les lignes 181-220 du fichier modifié pour confirmer que `files` (déclaré ligne 182 : `const files = formatFolder?.files || [];`) est bien accessible à cet endroit — c'est le cas, il est déclaré juste avant dans la même fonction, avant le `return`.

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && grep -n "Aucune référence trouvée" client/src/components/DossierAutocomplete.jsx`

Expected: une ligne affichée montrant la nouvelle chaîne de statut.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion"
git add client/src/components/DossierAutocomplete.jsx
git commit -m "$(cat <<'EOF'
fix: distinguer statut 'aucune reference trouvee' de 'aucun fichier local'

Ces deux cas etaient confondus sous le meme statut, alors qu'ils appellent
des actions differentes : dossier de format vide/introuvable vs fichiers
presents mais aucun ne matche par reference (selection manuelle requise).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Garder les lignes sans référence visibles + bannière d'avertissement

**Files:**
- Modify: `client/src/components/DossierAutocomplete.jsx:330-404`

**Interfaces:**
- Consumes : `buildRows(body, pathData, formatTauro)` (Task 2) — chaque ligne a `formatPath` (`string`, vide si dossier de format introuvable), `teinteMasse` (`boolean`), `selectedFileObject` (`object|null`), `libelle` (`string`), `reference` (`string`), `id` (`string`).
- Produces : `loadNumbers` continue d'appeler `setLoadedDossiers`/`emitJobs` avec les mêmes formes d'objets qu'avant (aucun changement de shape) — seul le contenu de `allJobs` change (plus de lignes incluses) et `setMessage` peut maintenant contenir un texte d'avertissement en plus des erreurs existantes.

- [ ] **Step 1: Modifier le filtre `validRows` et ajouter l'agrégation des avertissements**

Dans `client/src/components/DossierAutocomplete.jsx`, dans la fonction `loadNumbers`, remplace (lignes 355-356) :

```js
    const newDossiers = [];
    const errors = [];
```

par :

```js
    const newDossiers = [];
    const errors = [];
    const warnings = [];
```

Puis remplace (lignes 369-389) :

```js
      const clientKey = findKnownClient(body.client) || "";
      const rows = buildRows(body, pathData, formatTauro);
      const pkRows = buildProfilsKitsRows(body, clientKey);
      const validRows = rows.filter((r) => (r.formatPath || r.teinteMasse) && r.selectedFileObject);
      const allRows = [
        ...validRows.map((row) => ({ ...row, dossierNumero: body.numero })),
        ...pkRows,
      ];

      if (allRows.length === 0) {
        errors.push(`${numero} : Aucun visuel exploitable et aucun profil/kit trouvé.`);
        continue;
      }

      newDossiers.push({
        numero: body.numero,
        client: body.client,
        clientKey,
        jobs: allRows,
      });
```

par :

```js
      const clientKey = findKnownClient(body.client) || "";
      const rows = buildRows(body, pathData, formatTauro);
      const pkRows = buildProfilsKitsRows(body, clientKey);
      // On garde toute ligne dont le dossier de format a été résolu (ou teinte masse),
      // même sans fichier présélectionné, pour permettre un choix manuel dans le tableau
      // plutôt que de la faire disparaître silencieusement.
      const validRows = rows.filter((r) => r.formatPath || r.teinteMasse);
      const manualSelectionRows = validRows.filter((r) => !r.teinteMasse && !r.selectedFileObject);
      const allRows = [
        ...validRows.map((row) => ({ ...row, dossierNumero: body.numero })),
        ...pkRows,
      ];

      if (allRows.length === 0) {
        errors.push(`${numero} : Aucun visuel exploitable et aucun profil/kit trouvé.`);
        continue;
      }

      if (manualSelectionRows.length > 0) {
        const libelles = manualSelectionRows.map((r) => r.libelle || r.reference || r.id).join(", ");
        warnings.push(
          `${numero} : ${manualSelectionRows.length} visuel(s) sans référence trouvée — sélection manuelle requise (${libelles})`,
        );
      }

      newDossiers.push({
        numero: body.numero,
        client: body.client,
        clientKey,
        jobs: allRows,
      });
```

- [ ] **Step 2: Afficher les avertissements dans la bannière de message existante**

Remplace (lignes 398-403) :

```js
    if (errors.length > 0) {
      setMessage({
        type: errors.length === newNumbers.length ? "error" : "warning",
        text: errors.join(" · "),
      });
    }
```

par :

```js
    const messages = [...errors, ...warnings];
    if (messages.length > 0) {
      setMessage({
        type: errors.length > 0 && errors.length === newNumbers.length ? "error" : "warning",
        text: messages.join(" · "),
      });
    }
```

- [ ] **Step 3: Relire le résultat**

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && grep -n "manualSelectionRows\|const warnings" client/src/components/DossierAutocomplete.jsx`

Expected: 3 lignes affichées (déclaration de `warnings`, déclaration de `manualSelectionRows`, usage dans le `.push`).

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion"
git add client/src/components/DossierAutocomplete.jsx
git commit -m "$(cat <<'EOF'
fix: garder visibles les visuels sans reference + avertir en amont

validRows n'exclut plus les lignes sans selectedFileObject : un visuel dont
le dossier de format est resolu mais dont aucune reference ne matche un
fichier reste affiche dans le tableau (menu deroulant deja fonctionnel pour
le choix manuel dans App.jsx), avec un message d'avertissement liste des
visuels concernes des le chargement du dossier.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Vérification de bout en bout avec les données réelles du dossier 166237

**Files:**
- Aucun fichier modifié — vérification uniquement.

**Interfaces:**
- Consumes : le serveur de dev déjà en cours d'exécution (`npm run server`, port 8000) et le client Vite (`npm run client`, port 5173), tous deux déjà lancés dans cette session (confirmés via `server/server.log`).

- [ ] **Step 1: Rebuild implicite (Vite dev sert le code source directement)**

Aucune action requise : le serveur `npm run client` (Vite dev) recharge automatiquement `DossierAutocomplete.jsx` à chaud. Confirmer que le HMR a bien pris le changement en vérifiant l'absence d'erreur dans la console du navigateur (voir Step 2).

- [ ] **Step 2: Reproduire le cas réel dans le navigateur**

Ouvrir l'application (`http://localhost:5173`), aller dans l'onglet "Dossier Api", saisir `166237`, lancer la recherche.

Expected :
- Une bannière d'avertissement (orange) apparaît, mentionnant `166237` et `1 visuel(s) sans référence trouvée — sélection manuelle requise` avec le libellé `POSÉIDON DROITE 125x255cm`.
- Le tableau affiche bien 2 lignes pour le dossier 166237 (au lieu d'une ligne masquée) :
  - la ligne "POSÉIDON GAUCHE 100x255cm" est cochée, avec `POSEIDON 100x255 GAUCHE 94953716 MAT.pdf` présélectionné ;
  - la ligne "POSÉIDON DROITE 125x255cm" est décochée, avec le menu déroulant de fichier vide (pas de présélection) — l'utilisateur peut cliquer dessus et retrouver tous les fichiers du dossier `5_125x255`, y compris `POSEIDON 125x255 DROIT 94956918 MAT.pdf`, pour choisir manuellement.

Si l'extension navigateur Claude n'est pas connectée pour une vérification automatisée, demander à l'utilisateur de confirmer manuellement ces deux points.

- [ ] **Step 3: Vérifier qu'aucune régression n'affecte un dossier sans problème de référence**

Charger un numéro de dossier différent connu pour bien fonctionner (à défaut, réutiliser 166237 suffit puisqu'il contient déjà un cas "match parfait" avec le visuel GAUCHE) et confirmer que ce visuel reste correctement présélectionné et coché comme avant le changement.

- [ ] **Step 4: Lint rapide du fichier modifié**

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && npx eslint client/src/components/DossierAutocomplete.jsx`

Expected: aucune erreur (le fichier utilise déjà la config ESLint/Prettier du projet, cf. commit `78fce07`).
