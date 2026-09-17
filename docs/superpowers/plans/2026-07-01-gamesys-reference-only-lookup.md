# Résolution référence visuelle Gamesys par référence uniquement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pour les visuels Gamesys, ne plus jamais dériver une "référence produit" d'un texte libre non structuré (remarques, recherche approximative par mots-clés sur `fs_stock`) — chercher uniquement via des identifiants structurés : référence Gamesys explicite validée, EAN, ou clé `{model, format}` résolue directement dans MongoDB.

**Architecture:** Deux fichiers backend modifiés. `server/src/gamesys/utils/reference.js` perd son fallback "NO CC" (qui extrayait par erreur le numéro de commande client comme référence produit). `server/src/gamesys/services/dossierService.js` remplace la Priorité 3 (recherche LIKE textuelle sur `fs_stock`, cassée par un mismatch d'accentuation SQL) par un lookup MongoDB direct `{model, format}`, mais uniquement pour les visuels — les profils gardent leur recherche par mots-clés existante, inchangée.

**Tech Stack:** Node.js CommonJS, Mongoose (MongoDB), ODBC (Gamesys). Pas de framework de test automatisé couvrant ce chemin — vérification par scripts Node jetables contre les données réelles du dossier 166237 (même méthode que le diagnostic initial).

## Global Constraints

- Scope strictement limité aux **visuels** (décors) — profils et kits de pose (`buildProfileReferences`, `buildKitPoseReferences`, `getProfileSearchTerms`, `isKitPoseLabel`) restent inchangés.
- Priorités 1 (référence Gamesys explicite validée) et 2 (EAN 13 chiffres) de `findStockReferences` restent inchangées — ce sont déjà des recherches par identifiant exact, pas des recherches floues.
- Aucun repli sur une recherche approximative de texte pour les visuels : si aucune référence structurée n'est trouvée (Priorité 1, 2, ni le nouveau lookup Mongo), le visuel n'a pas de référence — pas de génération d'une fausse référence.
- Aucun nouveau fichier, aucune nouvelle dépendance npm.

---

### Task 1 : Supprimer le fallback "NO CC" dans `getVisualReferenceFromEntete`

**Files:**
- Modify: `server/src/gamesys/utils/reference.js:77-86`

**Interfaces:**
- Consumes : rien de nouveau.
- Produces : `getVisualReferenceFromEntete(entete)` retourne toujours une `string` (référence ou `""`), mais ne retourne plus jamais un numéro extrait de `entete.endv_rmq`. Signature et type de retour inchangés — seuls les appelants existants (`findStockReferences` Priorité 1, `buildVisualReferences` dans `dossierService.js`) sont affectés par le changement de *comportement*, pas de *contrat*.

- [ ] **Step 1 : Écrire le script de vérification jetable**

Ce repo n'a pas de framework de test pour ce module. Créer un script Node jetable qui teste la fonction directement, avec un cas reproduisant exactement le bug réel (dossier 166237) et un cas de non-régression (référence explicite valide).

Créer `C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion\server\_verify_reference.js` :

```js
const assert = require("assert");
const { getVisualReferenceFromEntete } = require("./src/gamesys/utils/reference");

// Cas réel dossier 166237 : endv_ref_client/no_modele/code_complet_modele absents,
// endv_rmq contient "NO CC 314188" (numéro de commande CLIENT, pas une référence produit).
const enteteSansRefExplicite = {
  endv_ref_client: null,
  endv_no_modele: null,
  endv_code_complet_modele: null,
  endv_rmq: "1 x 243,85 € - NO CC 314188 NOM CLIENT GARANDEL LES LIVRAISONS...",
};
assert.strictEqual(
  getVisualReferenceFromEntete(enteteSansRefExplicite),
  "",
  "Ne doit plus jamais extraire un numéro de endv_rmq — attendu chaîne vide",
);

// Non-régression : une référence explicite valide continue de fonctionner.
const enteteAvecRefExplicite = {
  endv_ref_client: "94953716",
  endv_no_modele: null,
  endv_code_complet_modele: null,
  endv_rmq: "peu importe",
};
assert.strictEqual(
  getVisualReferenceFromEntete(enteteAvecRefExplicite),
  "94953716",
  "Une référence explicite valide doit toujours être retournée",
);

console.log("OK — plus de fallback NO CC, références explicites toujours fonctionnelles.");
```

- [ ] **Step 2 : Lancer le script pour vérifier qu'il échoue sur le code actuel**

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && node server/_verify_reference.js`

Expected: `AssertionError [ERR_ASSERTION]: Ne doit plus jamais extraire un numéro de endv_rmq — attendu chaîne vide` (le code actuel retourne `"314188"`, pas `""`).

- [ ] **Step 3 : Modifier `getVisualReferenceFromEntete`**

Dans `server/src/gamesys/utils/reference.js`, remplacer (lignes 77-86) :

```js
function getVisualReferenceFromEntete(entete) {
  const explicitReference = [entete?.endv_ref_client, entete?.endv_no_modele, entete?.endv_code_complet_modele].find(
    (value) => value && String(value).trim(),
  );

  if (explicitReference) return String(explicitReference).trim();

  const noCcMatch = String(entete?.endv_rmq || "").match(/\bNO\s*CC\s*[:#-]?\s*([0-9]{3,})\b/i);
  return noCcMatch?.[1] || "";
}
```

par :

```js
// Un numéro de commande client ("NO CC" dans endv_rmq) n'est structurellement jamais une
// référence produit — ne dériver une référence QUE des champs explicites du devis.
function getVisualReferenceFromEntete(entete) {
  const explicitReference = [entete?.endv_ref_client, entete?.endv_no_modele, entete?.endv_code_complet_modele].find(
    (value) => value && String(value).trim(),
  );

  return explicitReference ? String(explicitReference).trim() : "";
}
```

- [ ] **Step 4 : Relancer le script pour confirmer le fix**

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && node server/_verify_reference.js`

Expected: `OK — plus de fallback NO CC, références explicites toujours fonctionnelles.` (exit code 0)

- [ ] **Step 5 : Supprimer le script jetable**

Run: `rm "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion\server\_verify_reference.js"`

- [ ] **Step 6 : Commit**

```bash
cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion"
git add server/src/gamesys/utils/reference.js
git commit -m "$(cat <<'EOF'
fix: supprimer le fallback NO CC dans la resolution de reference visuelle

Un numero de commande client (extrait du texte libre endv_rmq) n'est
structurellement jamais une reference produit. Ce fallback faisait passer
le NO CC pour une reference quand aucun champ explicite n'etait rempli
(cas reel : dossier 166237, POSEIDON DROITE 125x255, NO CC 314188 utilise
comme reference au lieu de la vraie 94956918).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 : Lookup MongoDB `{model, format}` pour les visuels (Priorité 3)

**Files:**
- Modify: `server/src/gamesys/services/dossierService.js:194-231`

**Interfaces:**
- Consumes : `extractModelFromIdentif(identif)` (retourne `string`, défini ligne 88-93), `extractDimensionFormat(identif)` (retourne `string|null`, défini ligne 80-86), `RefDeco`/`RefEcom`/`RefBrico`/`RefCasto` (modèles Mongoose déjà importés lignes 13-16), `getProfileSearchTerms`/`isProfileLabel` (déjà importés), `getVisualReferenceFromEntete` de la Task 1 — le comportement changé de cette fonction (Task 1) doit déjà être en place avant cette tâche.
- Produces : `findStockReferences(connection, enteteDevis, preferredRefModel)` garde exactement la même signature et le même type de retour (`Promise<Array<{reference, modele, libelle, gencod, codeTarif, famille, sousFamille, type, source}>>`) — seul le contenu interne de la branche "visuel" change. `buildVisualReferences` (appelant, non modifié dans cette tâche) continue de fonctionner sans changement.

- [ ] **Step 1 : Écrire le script de vérification jetable (contre les données réelles)**

Créer `C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion\server\_verify_stock_lookup.js` :

```js
// Chemin résolu via __dirname (pas cwd) pour fonctionner quel que soit le répertoire
// depuis lequel le script est lancé.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const assert = require("assert");
const connectMongo = require("./src/mongoose");
const { checkOdbcConnection } = require("./src/gamesys/config/db");
const dossierService = require("./src/gamesys/services/dossierService");

// findStockReferences n'est pas exportée (fonction interne du module) — on vérifie
// son effet via getDossierDetail (déjà exportée), qui l'appelle en interne pour
// construire visualReferences. C'est le même chemin que production.
(async () => {
  try {
    await connectMongo();
    await checkOdbcConnection();
    // getDossierDetail({view:"summary"}) retourne, au niveau racine, un champ
    // `visualReferences` déjà aplati sur tous les sous-dossiers du numéro demandé
    // (cf. buildGroupedResponse, dossierService.js:551,571) — chaque entrée a un
    // champ `reference` (string) et `libelle` (string).
    const detail = await dossierService.getDossierDetail({ numero: "166237", view: "summary" });
    console.log(JSON.stringify(detail.visualReferences, null, 2));

    const droite = detail.visualReferences.find((j) => (j.libelle || "").includes("DROITE"));
    assert.ok(droite, "Visuel POSÉIDON DROITE 125x255 introuvable dans la réponse");
    assert.strictEqual(
      droite.reference,
      "94956918",
      `Référence attendue 94956918, obtenu ${droite.reference}`,
    );

    const gauche = detail.visualReferences.find((j) => (j.libelle || "").includes("GAUCHE"));
    assert.ok(gauche, "Visuel POSÉIDON GAUCHE 100x255 introuvable dans la réponse");
    assert.strictEqual(
      gauche.reference,
      "94953716",
      `Référence attendue 94953716 (non-régression), obtenu ${gauche.reference}`,
    );

    console.log("OK — POSÉIDON DROITE résolu via Mongo (94956918), POSÉIDON GAUCHE toujours correct (94953716).");
  } catch (err) {
    console.error("ERREUR:", err.stack || err.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
```

- [ ] **Step 2 : Lancer le script pour confirmer qu'il échoue sur le code actuel**

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && NODE_ENV=development node server/_verify_stock_lookup.js`

Expected: échec sur l'assertion de `droite.reference` (obtient `""` après la Task 1, ou `"314188"` si lancé avant la Task 1) au lieu de `"94956918"`.

- [ ] **Step 3 : Modifier `findStockReferences` — Priorité 3**

Dans `server/src/gamesys/services/dossierService.js`, remplacer (lignes 194-231) :

```js
  // Priorité 3 : recherche LIKE textuelle (fallback — ne retourne que les correspondances exactes confirmées)
  const terms = isProfileLabel(identif) ? getProfileSearchTerms(identif) : getSearchTerms(identif);
  const numericTerms = terms.filter((term) => /^\d+$/.test(term));
  const firstLabelTerm = terms.find((term) => /^[A-Z]+$/.test(term));
  const candidateTerms = isProfileLabel(identif) ? terms : [firstLabelTerm, ...numericTerms];
  const usefulTerms = candidateTerms
    .filter(Boolean)
    .filter((term) => !["CM", "MM"].includes(term));

  if (usefulTerms.length < 2) return [];

  const likeParams = [];
  const where = usefulTerms
    .map((term) => {
      const likeVal = `%${escapeSqlLike(term)}%`;
      likeParams.push(likeVal, likeVal, likeVal, likeVal, likeVal);
      return `(upper(st_lib_1_conso) like ? ESCAPE '\\' or upper(st_lib_2_conso) like ? ESCAPE '\\' or upper(st_art_ref_client) like ? ESCAPE '\\' or upper(st_modele) like ? ESCAPE '\\' or upper(st_code_tarif) like ? ESCAPE '\\')`;
    })
    .join(" and ");

  const rows = await query(
    connection,
    `${STOCK_SELECT} where ${where} order by st_seq desc limit 25`,
    likeParams
  );

  const exactRows = rows.filter((row) => {
    const haystack = normalizeSearchText([
      row.st_lib_1_conso,
      row.st_lib_2_conso,
      row.st_art_ref_client,
      row.st_code_tarif,
    ].filter(Boolean).join(" "));
    return terms.every((term) => haystack.includes(term));
  });

  return (await enrichRowsWithMongoRef(exactRows, identif, preferredRefModel)).map(mapStockRow);
}
```

par :

```js
  // Priorité 3 (profils) : recherche LIKE textuelle inchangée — hors scope du fix référence visuelle.
  if (isProfileLabel(identif)) {
    const terms = getProfileSearchTerms(identif);
    const usefulTerms = terms.filter(Boolean).filter((term) => !["CM", "MM"].includes(term));

    if (usefulTerms.length < 2) return [];

    const likeParams = [];
    const where = usefulTerms
      .map((term) => {
        const likeVal = `%${escapeSqlLike(term)}%`;
        likeParams.push(likeVal, likeVal, likeVal, likeVal, likeVal);
        return `(upper(st_lib_1_conso) like ? ESCAPE '\\' or upper(st_lib_2_conso) like ? ESCAPE '\\' or upper(st_art_ref_client) like ? ESCAPE '\\' or upper(st_modele) like ? ESCAPE '\\' or upper(st_code_tarif) like ? ESCAPE '\\')`;
      })
      .join(" and ");

    const rows = await query(
      connection,
      `${STOCK_SELECT} where ${where} order by st_seq desc limit 25`,
      likeParams
    );

    const exactRows = rows.filter((row) => {
      const haystack = normalizeSearchText([
        row.st_lib_1_conso,
        row.st_lib_2_conso,
        row.st_art_ref_client,
        row.st_code_tarif,
      ].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    });

    return (await enrichRowsWithMongoRef(exactRows, identif, preferredRefModel)).map(mapStockRow);
  }

  // Priorité 3 (visuels) : lookup MongoDB direct par {model, format} — pas de recherche
  // approximative sur fs_stock. La déaccentuation du terme de recherche (normalizeSearchText)
  // ne s'appliquait jamais à la colonne SQL comparée (st_lib_1_conso reste accentué en base),
  // ce qui faisait échouer silencieusement toute correspondance sur les libellés accentués
  // (ex: "POSÉIDON") sans doublon historique non-accentué compatible.
  const model = extractModelFromIdentif(identif);
  if (!model) return [];

  const format = extractDimensionFormat(identif);
  const allModels = [RefDeco, RefEcom, RefBrico, RefCasto];
  const orderedModels = preferredRefModel
    ? [preferredRefModel, ...allModels.filter((m) => m !== preferredRefModel)]
    : allModels;
  const mongoQuery = format ? { model, format } : { model };
  const docs = await Promise.all(orderedModels.map((m) => m.findOne(mongoQuery).lean().catch(() => null)));
  const mongoDoc = docs.find(Boolean);
  if (!mongoDoc) return [];

  return [
    {
      reference: mongoDoc.ref,
      modele: mongoDoc.ref,
      libelle: identif,
      gencod: undefined,
      codeTarif: undefined,
      famille: undefined,
      sousFamille: undefined,
      type: undefined,
      source: "mongo_model_format",
    },
  ];
}
```

- [ ] **Step 4 : Relancer le script pour confirmer le fix**

Run: `cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion" && NODE_ENV=development node server/_verify_stock_lookup.js`

Expected: `OK — POSÉIDON DROITE résolu via Mongo (94956918), POSÉIDON GAUCHE toujours correct (94953716).` (exit code 0)

- [ ] **Step 5 : Supprimer le script jetable**

Run: `rm "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion\server\_verify_stock_lookup.js"`

- [ ] **Step 6 : Commit**

```bash
cd "C:\Users\Kongsberg\Desktop\JOE\DEV\decoGestion"
git add server/src/gamesys/services/dossierService.js
git commit -m "$(cat <<'EOF'
fix: resoudre la reference visuelle par lookup MongoDB model+format

Remplace la recherche LIKE textuelle (Priorite 3) par un lookup MongoDB
direct {model, format} pour les visuels, en s'appuyant sur la meme logique
de priorite client que enrichRowsWithMongoRef. Corrige le mismatch
d'accentuation SQL qui faisait echouer silencieusement la recherche sur
les libelles Gamesys accentues (cas reel : POSEIDON DROITE 125x255, ref
94956918 introuvable via LIKE malgre son existence en base). Les profils
gardent leur recherche par mots-cles existante, inchangee.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 : Vérification de bout en bout avec les données réelles du dossier 166237

**Files:**
- Aucun fichier modifié — vérification uniquement.

**Interfaces:**
- Consumes : le serveur de dev en cours d'exécution (`npm run server`, actuellement sur le **port 9000** — vérifier `.env` `PORT` avant de tester, le port 8000 peut héberger un processus obsolète) et le client Vite (`npm run client`).

- [ ] **Step 1 : Requête live sur le vrai serveur**

Confirmer le port réel du serveur avant de tester :

Run: `netstat -ano | grep LISTENING | grep -E ":8000 |:9000 "`

Puis, en utilisant le port confirmé (remplacer 9000 si différent) :

Run: `curl -s "http://localhost:9000/dossier-api/166237" -H "Accept: application/json"`

Expected : dans la réponse JSON, le visuel "POSÉIDON DROITE 125x255cm" a `"reference": "94956918"` (plus `"314188"`), et le visuel "POSÉIDON GAUCHE 100x255cm" garde `"reference": "94953716"`.

- [ ] **Step 2 : Vérifier l'absence de régression sur un autre dossier**

Si un autre numéro de dossier est disponible pour test manuel (demander à l'utilisateur un numéro de dossier avec des visuels non-accentués ou avec référence explicite Gamesys renseignée), répéter Step 1 avec ce numéro et confirmer que les références résolues restent cohérentes avec avant ce changement.

- [ ] **Step 3 : Vérifier dans le navigateur que le fichier PDF se sélectionne maintenant correctement**

Ouvrir l'application, onglet "Dossier Api", charger le dossier 166237.

Expected : le visuel "POSÉIDON DROITE 125x255cm" n'affiche plus la bannière "sélection manuelle requise" (introduite par le plan précédent) et présélectionne automatiquement `POSEIDON 125x255 DROIT 94956918 MAT.pdf` — la référence 94956918 matche directement ce fichier via le scoring déjà en place côté frontend (`DossierAutocomplete.jsx`, aucune modification nécessaire ici).
