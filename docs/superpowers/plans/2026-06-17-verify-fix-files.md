# Script verifyAndFixFiles — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer un script autonome `server/scripts/verifyAndFixFiles.js` qui scanne les PDFs réseau, vérifie leur référence dans Gamesys (ODBC/fs_stock), génère un rapport Markdown, et peut renommer les fichiers incorrects en trouvant la bonne référence par fuzzy search.

**Architecture:** Un seul fichier script avec des fonctions pures testables (buildRenameTarget, classifyEntries, generateMarkdownReport) et des fonctions I/O (scan PDF, lookup ODBC, fs.rename). Les fonctions I/O réutilisent les modules existants (stockReferenceLookupService, referencesCheckService, gamesys/lib/db). Le flux: scan → lookup Gamesys → classify → report → [fix/dry-run].

**Tech Stack:** Node.js, Mocha (tests), ODBC via modules gamesys existants, fs/path built-in.

---

## Structure des fichiers

```
server/scripts/verifyAndFixFiles.js          [CREATE] — script principal
server/scripts/reports/                       [AUTO — créé par le script]
test/unit/verifyAndFixFiles.test.js          [CREATE] — tests fonctions pures
server/src/services/referencesCheckService.js [MODIFY] — exporter REF_REGEX_BY_CLIENT
```

---

## Task 1 : Exporter REF_REGEX_BY_CLIENT

**Files:**
- Modify: `server/src/services/referencesCheckService.js`

- [ ] **Step 1 : Ajouter REF_REGEX_BY_CLIENT aux exports**

Dans `server/src/services/referencesCheckService.js`, modifier la ligne `module.exports` :

```js
// Avant (ligne ~104) :
module.exports = {
  extractRefFromFilename,
  extractFormatFromFilename,
  buildFileEntries,
  compareClientReferences,
  checkAllClients,
};

// Après :
module.exports = {
  REF_REGEX_BY_CLIENT,
  extractRefFromFilename,
  extractFormatFromFilename,
  buildFileEntries,
  compareClientReferences,
  checkAllClients,
};
```

- [ ] **Step 2 : Vérifier qu'aucun test existant ne casse**

```bash
npm test
```

Résultat attendu : tous les tests passent (aucun import de ce module dans les tests existants ne sera cassé).

- [ ] **Step 3 : Commit**

```bash
git add server/src/services/referencesCheckService.js
git commit -m "feat: exporter REF_REGEX_BY_CLIENT depuis referencesCheckService"
```

---

## Task 2 : Fonctions pures + tests

**Files:**
- Create: `test/unit/verifyAndFixFiles.test.js`
- Create (partiel): `server/scripts/verifyAndFixFiles.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `test/unit/verifyAndFixFiles.test.js` :

```js
"use strict";
const assert = require("assert");
const { buildRenameTarget, classifyEntries } = require("../../server/scripts/verifyAndFixFiles");

describe("verifyAndFixFiles — fonctions pures", () => {
  describe("buildRenameTarget", () => {
    it("remplace la vieille ref par la nouvelle dans le nom de fichier", () => {
      assert.strictEqual(
        buildRenameTarget("MOSAIQUE 94953677 MAT.pdf", "94953677", "94953676"),
        "MOSAIQUE 94953676 MAT.pdf"
      );
    });

    it("ne modifie pas le nom si la vieille ref n'y figure pas", () => {
      assert.strictEqual(
        buildRenameTarget("MOSAIQUE 94953677 MAT.pdf", "00000000", "94953676"),
        "MOSAIQUE 94953677 MAT.pdf"
      );
    });

    it("remplace seulement la première occurrence", () => {
      assert.strictEqual(
        buildRenameTarget("12345678 12345678 MAT.pdf", "12345678", "99999999"),
        "99999999 12345678 MAT.pdf"
      );
    });
  });

  describe("classifyEntries", () => {
    const makeEntry = (ref, fileName = "test.pdf") => ({
      filePath: `/reseau/LM/${fileName}`,
      fileName,
      ref,
      format: "100x210",
      client: "LM",
    });

    it("classe un fichier OK quand sa ref est dans stockMap", () => {
      const entries = [makeEntry("94953676")];
      const stockMap = new Map([["94953676", { st_modele: "MOSAIQUE" }]]);
      const { ok, noRef, notInGamesys } = classifyEntries(entries, stockMap);
      assert.strictEqual(ok.length, 1);
      assert.strictEqual(noRef.length, 0);
      assert.strictEqual(notInGamesys.length, 0);
    });

    it("classe un fichier noRef quand ref est null", () => {
      const entries = [makeEntry(null, "SANS-REF.pdf")];
      const stockMap = new Map();
      const { ok, noRef, notInGamesys } = classifyEntries(entries, stockMap);
      assert.strictEqual(noRef.length, 1);
      assert.strictEqual(ok.length, 0);
    });

    it("classe un fichier notInGamesys quand sa ref n'est pas dans stockMap", () => {
      const entries = [makeEntry("99999999")];
      const stockMap = new Map();
      const { ok, noRef, notInGamesys } = classifyEntries(entries, stockMap);
      assert.strictEqual(notInGamesys.length, 1);
    });

    it("filtre les profils et teintes masse", () => {
      const entries = [
        { filePath: "/f/PROFIL BLANC.pdf", fileName: "PROFIL BLANC.pdf", ref: null, format: null, client: "LM" },
        { filePath: "/f/NOIR ZERO MAT.pdf", fileName: "NOIR ZERO MAT.pdf", ref: null, format: null, client: "LM" },
      ];
      const stockMap = new Map();
      const { ok, noRef, notInGamesys, excluded } = classifyEntries(entries, stockMap);
      assert.strictEqual(excluded.length, 2);
      assert.strictEqual(noRef.length, 0);
    });
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent (module non trouvé)**

```bash
npx mocha test/unit/verifyAndFixFiles.test.js
```

Résultat attendu : `Error: Cannot find module '../../server/scripts/verifyAndFixFiles'`

- [ ] **Step 3 : Créer verifyAndFixFiles.js avec les fonctions pures**

Créer `server/scripts/verifyAndFixFiles.js` :

```js
"use strict";
const path = require("path");
const fs = require("fs");
const { isProfileLabel, isTeinteMasseModel } = require("../src/gamesys/utils/reference");

// ─── Fonctions pures ──────────────────────────────────────────────────────────

/**
 * Remplace oldRef par newRef dans fileName (première occurrence).
 * Retourne le nom inchangé si oldRef ne figure pas dans fileName.
 */
function buildRenameTarget(fileName, oldRef, newRef) {
  return fileName.replace(oldRef, newRef);
}

/**
 * Classe les FileEntry[] en quatre catégories :
 *   ok           — ref trouvée dans stockMap
 *   noRef        — ref non extraite du nom de fichier
 *   notInGamesys — ref extraite mais absente de stockMap
 *   excluded     — profils ou teintes masse (ignorés)
 */
function classifyEntries(fileEntries, stockMap) {
  const ok = [];
  const noRef = [];
  const notInGamesys = [];
  const excluded = [];

  for (const entry of fileEntries) {
    if (isProfileLabel(entry.fileName) || isTeinteMasseModel(entry.fileName)) {
      excluded.push(entry);
      continue;
    }
    if (!entry.ref) {
      noRef.push(entry);
      continue;
    }
    if (stockMap.has(entry.ref)) {
      ok.push({ ...entry, stockRow: stockMap.get(entry.ref) });
    } else {
      notInGamesys.push(entry);
    }
  }

  return { ok, noRef, notInGamesys, excluded };
}

module.exports = { buildRenameTarget, classifyEntries };
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx mocha test/unit/verifyAndFixFiles.test.js
```

Résultat attendu : 7 tests passent, 0 échec.

- [ ] **Step 5 : Commit**

```bash
git add server/scripts/verifyAndFixFiles.js test/unit/verifyAndFixFiles.test.js
git commit -m "feat: fonctions pures buildRenameTarget et classifyEntries + tests"
```

---

## Task 3 : Squelette CLI + vérification ODBC + lecture config

**Files:**
- Modify: `server/scripts/verifyAndFixFiles.js`

- [ ] **Step 1 : Ajouter les imports, parseArgs, loadConfig et le squelette de main()**

Remplacer le contenu de `server/scripts/verifyAndFixFiles.js` par :

```js
"use strict";
process.env.NODE_ENV = "development";

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { checkOdbcConnection } = require("../src/gamesys/config/db");
const { withDbConnection, query } = require("../src/gamesys/lib/db");
const { findStockByRefs } = require("../src/gamesys/services/stockReferenceLookupService");
const { buildFileEntries, REF_REGEX_BY_CLIENT } = require("../src/services/referencesCheckService");
const { getSearchTerms, isProfileLabel, isTeinteMasseModel } = require("../src/gamesys/utils/reference");

const CLIENTS = ["LM", "CASTO", "BRICO", "ECOM"];
const CONFIG_PATH = path.join(__dirname, "../../config.json");
const REPORTS_DIR = path.join(__dirname, "reports");

// ─── Fonctions pures ──────────────────────────────────────────────────────────

function buildRenameTarget(fileName, oldRef, newRef) {
  return fileName.replace(oldRef, newRef);
}

function classifyEntries(fileEntries, stockMap) {
  const ok = [];
  const noRef = [];
  const notInGamesys = [];
  const excluded = [];

  for (const entry of fileEntries) {
    if (isProfileLabel(entry.fileName) || isTeinteMasseModel(entry.fileName)) {
      excluded.push(entry);
      continue;
    }
    if (!entry.ref) {
      noRef.push(entry);
      continue;
    }
    if (stockMap.has(entry.ref)) {
      ok.push({ ...entry, stockRow: stockMap.get(entry.ref) });
    } else {
      notInGamesys.push(entry);
    }
  }

  return { ok, noRef, notInGamesys, excluded };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    fix: args.includes("--fix"),
    dryRun: args.includes("--dry-run"),
    client: (args.find((a) => a.startsWith("--client=")) || "").replace("--client=", "").toUpperCase() || null,
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) throw new Error(`config.json introuvable : ${CONFIG_PATH}`);
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);
  // Les clés de config.json peuvent être en minuscules (lm, casto…) — on normalise.
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k.toUpperCase(), v]));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const mode = opts.fix ? "--fix" : opts.dryRun ? "--dry-run" : "rapport";
  console.log(`\nMode : ${mode}${opts.client ? ` | Client : ${opts.client}` : ""}`);

  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  const clients = opts.client ? [opts.client] : CLIENTS;
  const missingDirs = clients.filter((c) => !config[c]);
  if (missingDirs.length) {
    console.warn(`⚠️  Clients absents de config.json : ${missingDirs.join(", ")}`);
  }

  console.log("Vérification connexion ODBC (Gamesys)...");
  const odbcOk = await checkOdbcConnection();
  if (!odbcOk) {
    console.error("❌ ODBC indisponible. Vérifiez le DSN et la connexion réseau vers srv-bd.");
    process.exit(1);
  }
  console.log("✅ ODBC OK\n");

  // TODO tasks suivantes
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});

module.exports = { buildRenameTarget, classifyEntries };
```

- [ ] **Step 2 : Vérifier que le squelette démarre sans erreur ODBC (tester l'aide CLI)**

```bash
node server/scripts/verifyAndFixFiles.js --dry-run --client=LM
```

Résultat attendu : affiche `Mode : --dry-run | Client : LM`, tente ODBC, puis s'arrête sur le TODO.

- [ ] **Step 3 : Vérifier que les tests pures passent toujours**

```bash
npx mocha test/unit/verifyAndFixFiles.test.js
```

Résultat attendu : 7 tests passent.

- [ ] **Step 4 : Commit**

```bash
git add server/scripts/verifyAndFixFiles.js
git commit -m "feat: squelette CLI + parseArgs + loadConfig + checkOdbc"
```

---

## Task 4 : Scan récursif PDF + lookup Gamesys + classification

**Files:**
- Modify: `server/scripts/verifyAndFixFiles.js`

- [ ] **Step 1 : Ajouter scanDir, scanAllClients et lookupAllClients avant main()**

Insérer ces fonctions dans `server/scripts/verifyAndFixFiles.js` après les fonctions pures, avant `parseArgs` :

```js
// ─── I/O : scan fichiers ──────────────────────────────────────────────────────

function scanDir(dir) {
  const results = [];
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        results.push(...scanDir(full));
      } else if (item.isFile() && item.name.toLowerCase().endsWith(".pdf")) {
        results.push(full);
      }
    }
  } catch (e) {
    console.warn(`⚠️  Impossible de lire ${dir} : ${e.message}`);
  }
  return results;
}

function scanAllClients(config, clients) {
  const filesByClient = {};
  for (const client of clients) {
    const dir = config[client];
    if (!dir) { filesByClient[client] = []; continue; }
    console.log(`Scan ${client} (${dir})...`);
    const paths = scanDir(dir);
    filesByClient[client] = buildFileEntries(paths, client);
    console.log(`  → ${paths.length} PDF trouvés`);
  }
  return filesByClient;
}

// ─── I/O : lookup Gamesys ────────────────────────────────────────────────────

async function lookupAllClients(filesByClient) {
  const allRefs = Object.values(filesByClient)
    .flat()
    .map((e) => e.ref)
    .filter(Boolean);

  console.log(`\nLookup Gamesys pour ${allRefs.length} références...`);
  const stockMap = await findStockByRefs(allRefs);
  console.log(`✅ ${stockMap.size} correspondances trouvées\n`);
  return stockMap;
}
```

- [ ] **Step 2 : Mettre à jour main() pour appeler ces fonctions**

Remplacer le commentaire `// TODO tasks suivantes` dans `main()` par :

```js
  const filesByClient = scanAllClients(config, clients);
  const stockMap = await lookupAllClients(filesByClient);

  const classifiedByClient = {};
  for (const client of clients) {
    classifiedByClient[client] = classifyEntries(filesByClient[client] || [], stockMap);
  }

  // Affichage console résumé
  for (const client of clients) {
    const { ok, noRef, notInGamesys, excluded } = classifiedByClient[client];
    console.log(`${client} : ${ok.length} OK | ${notInGamesys.length} absents Gamesys | ${noRef.length} ref non extraite | ${excluded.length} exclus`);
  }

  // TODO tasks suivantes
```

- [ ] **Step 3 : Test console**

```bash
node server/scripts/verifyAndFixFiles.js --dry-run --client=LM
```

Résultat attendu : liste le nombre de PDFs scannés et le résumé de classification pour LM.

- [ ] **Step 4 : Commit**

```bash
git add server/scripts/verifyAndFixFiles.js
git commit -m "feat: scan récursif PDF, lookup Gamesys et classification par client"
```

---

## Task 5 : Fuzzy search dans fs_stock

**Files:**
- Modify: `server/scripts/verifyAndFixFiles.js`

- [ ] **Step 1 : Ajouter fuzzySearchRef après lookupAllClients**

```js
// ─── I/O : fuzzy search fs_stock ─────────────────────────────────────────────

/**
 * Cherche dans fs_stock les lignes dont st_lib_1_conso / st_lib_2_conso
 * contiennent tous les mots-clés extraits du nom de fichier.
 * Retourne 0, 1 ou plusieurs suggestions.
 */
async function fuzzySearchRef(fileName) {
  const terms = getSearchTerms(path.basename(fileName, ".pdf")).slice(0, 4);
  if (terms.length < 2) return [];

  const conditions = terms.map(() => "(st_lib_1_conso ILIKE ? OR st_lib_2_conso ILIKE ?)").join(" AND ");
  const params = terms.flatMap((t) => [`%${t}%`, `%${t}%`]);
  const sql = `
    SELECT st_art_ref_client, st_art_gencod, st_lib_1_conso, st_lib_2_conso, st_modele
    FROM public.fs_stock
    WHERE ${conditions}
    LIMIT 5
  `;

  return withDbConnection(async (connection) => {
    const rows = await query(connection, sql, params);
    return rows
      .map((row) => ({
        ref: String(row.st_art_ref_client || "").trim() || String(row.st_art_gencod || "").trim(),
        libelle: [row.st_lib_1_conso, row.st_lib_2_conso].filter(Boolean).join(" — "),
        modele: String(row.st_modele || "").trim(),
      }))
      .filter((s) => s.ref);
  });
}
```

- [ ] **Step 2 : Test manuel en isolation (ajouter temporairement dans main)**

Ajouter temporairement dans `main()` après la classification, pour valider :

```js
  // TEST TEMPORAIRE — retirer après validation
  const testEntry = Object.values(classifiedByClient).flatMap(c => c.notInGamesys)[0];
  if (testEntry) {
    console.log(`\nTest fuzzy search sur : ${testEntry.fileName}`);
    const suggestions = await fuzzySearchRef(testEntry.fileName);
    console.log("Suggestions Gamesys :", suggestions);
  }
```

```bash
node server/scripts/verifyAndFixFiles.js --dry-run --client=LM
```

Résultat attendu : affiche 0 à 5 suggestions Gamesys pour le premier fichier absent.

- [ ] **Step 3 : Retirer le code de test temporaire de main()**

- [ ] **Step 4 : Commit**

```bash
git add server/scripts/verifyAndFixFiles.js
git commit -m "feat: fuzzySearchRef — recherche fs_stock par mots-clés libellé"
```

---

## Task 6 : Génération du rapport Markdown

**Files:**
- Modify: `server/scripts/verifyAndFixFiles.js`
- Create (auto): `server/scripts/reports/`

- [ ] **Step 1 : Ajouter generateMarkdownReport et writeReport**

Insérer avant `parseArgs` :

```js
// ─── Rapport Markdown ─────────────────────────────────────────────────────────

function generateMarkdownReport(classifiedByClient, fixPlan, opts) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const mode = opts.fix ? "--fix" : opts.dryRun ? "--dry-run" : "rapport uniquement";

  const clientList = Object.keys(classifiedByClient);

  // Tableau résumé
  const summaryRows = clientList.map((client) => {
    const { ok, noRef, notInGamesys, excluded } = classifiedByClient[client];
    const total = ok.length + noRef.length + notInGamesys.length + excluded.length;
    return `| ${client} | ${total} | ${ok.length} | ${noRef.length} | ${notInGamesys.length} | ${excluded.length} |`;
  });
  const totals = clientList.reduce(
    (acc, c) => {
      const { ok, noRef, notInGamesys, excluded } = classifiedByClient[c];
      acc.total += ok.length + noRef.length + notInGamesys.length + excluded.length;
      acc.ok += ok.length;
      acc.noRef += noRef.length;
      acc.missing += notInGamesys.length;
      acc.excluded += excluded.length;
      return acc;
    },
    { total: 0, ok: 0, noRef: 0, missing: 0, excluded: 0 }
  );

  let md = `# Rapport de vérification fichiers visuels — ${dateStr}\n\n`;
  md += `Généré le : ${now.toISOString()}  \nMode : ${mode}\n\n`;
  md += `## Résumé\n\n`;
  md += `| Client | Fichiers scannés | ✅ OK | ⚠️ Ref non extraite | ❌ Absent Gamesys | ⏭️ Exclus |\n`;
  md += `|--------|-----------------|-------|---------------------|------------------|----------|\n`;
  md += summaryRows.join("\n") + "\n";
  md += `| **Total** | **${totals.total}** | **${totals.ok}** | **${totals.noRef}** | **${totals.missing}** | **${totals.excluded}** |\n`;

  md += `\n## Détail par client\n`;

  for (const client of clientList) {
    const { ok, noRef, notInGamesys } = classifiedByClient[client];
    md += `\n### ${client}\n`;

    if (notInGamesys.length) {
      md += `\n#### ❌ Références absentes de Gamesys (${notInGamesys.length})\n\n`;
      md += `| Fichier | Référence extraite |\n|---------|-------------------|\n`;
      for (const e of notInGamesys) {
        md += `| \`${e.fileName}\` | \`${e.ref}\` |\n`;
      }
    }

    if (noRef.length) {
      md += `\n#### ⚠️ Références non extraites (${noRef.length})\n\n`;
      for (const e of noRef) md += `- \`${e.fileName}\`\n`;
    }

    md += `\n#### ✅ Fichiers OK : ${ok.length}\n`;
  }

  // Section corrections si fix/dry-run
  if (fixPlan && fixPlan.length > 0) {
    const actionLabel = opts.fix ? "Corrections appliquées" : "Corrections simulées (--dry-run)";
    md += `\n## ${actionLabel}\n\n`;
    md += `| Ancien nom | Nouveau nom | Réf Gamesys | Statut |\n`;
    md += `|-----------|------------|-------------|--------|\n`;
    for (const item of fixPlan) {
      const newName = item.newName || "—";
      const ref = item.suggestion?.ref || "—";
      md += `| \`${item.entry.fileName}\` | \`${newName}\` | \`${ref}\` | ${item.status} |\n`;
    }
  }

  return md;
}

function writeReport(md, opts) {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const suffix = opts.client ? `-${opts.client.toLowerCase()}` : "";
  const filePath = path.join(REPORTS_DIR, `${dateStr}-verify-files${suffix}.md`);
  fs.writeFileSync(filePath, md, "utf8");
  console.log(`\n📄 Rapport écrit : ${filePath}`);
  return filePath;
}
```

- [ ] **Step 2 : Appeler generateMarkdownReport + writeReport dans main() à la place du TODO**

Remplacer `// TODO tasks suivantes` par :

```js
  const fixPlan = null; // rempli en Task 7
  const md = generateMarkdownReport(classifiedByClient, fixPlan, opts);
  writeReport(md, opts);
```

- [ ] **Step 3 : Test — vérifier que le rapport est créé**

```bash
node server/scripts/verifyAndFixFiles.js --client=LM
```

Résultat attendu : `📄 Rapport écrit : server/scripts/reports/2026-06-17-verify-files-lm.md` et le fichier contient le Markdown bien formé.

- [ ] **Step 4 : Commit**

```bash
git add server/scripts/verifyAndFixFiles.js
git commit -m "feat: génération rapport Markdown dans server/scripts/reports/"
```

---

## Task 7 : Mode fix/dry-run (applyFixes)

**Files:**
- Modify: `server/scripts/verifyAndFixFiles.js`

- [ ] **Step 1 : Ajouter applyFixes avant main()**

```js
// ─── Fix / Dry-run ────────────────────────────────────────────────────────────

/**
 * Pour chaque entrée notInGamesys de tous les clients :
 *   - fuzzy search → suggestions
 *   - 1 suggestion unique  → newName proposé, renommage si --fix
 *   - 0 ou N suggestions   → statut "❓ Non résolu"
 *
 * Retourne un tableau fixPlan[] pour l'inclure dans le rapport.
 */
async function applyFixes(classifiedByClient, isDryRun) {
  const fixPlan = [];
  const notInGamesysAll = Object.values(classifiedByClient).flatMap((c) => c.notInGamesys);

  if (notInGamesysAll.length === 0) {
    console.log("Aucun fichier à corriger.");
    return fixPlan;
  }

  console.log(`\nRecherche Gamesys pour ${notInGamesysAll.length} fichier(s) absent(s)...`);

  for (const entry of notInGamesysAll) {
    const suggestions = await fuzzySearchRef(entry.fileName);
    const item = { entry, suggestions, suggestion: null, newName: null, status: "" };

    if (suggestions.length === 1) {
      const sug = suggestions[0];
      const newName = buildRenameTarget(entry.fileName, entry.ref, sug.ref);
      item.suggestion = sug;
      item.newName = newName;

      if (newName === entry.fileName) {
        item.status = "⏭️ Nom identique — ignoré";
      } else if (isDryRun) {
        item.status = "🔵 Simulé (--dry-run)";
        console.log(`  [DRY-RUN] ${entry.fileName} → ${newName}`);
      } else {
        const newPath = path.join(path.dirname(entry.filePath), newName);
        try {
          fs.renameSync(entry.filePath, newPath);
          item.status = "✅ Renommé";
          console.log(`  ✅ ${entry.fileName} → ${newName}`);
        } catch (e) {
          item.status = `❌ Échec : ${e.message}`;
          console.error(`  ❌ Impossible de renommer ${entry.fileName} : ${e.message}`);
        }
      }
    } else if (suggestions.length === 0) {
      item.status = "❓ Non résolu (0 suggestion)";
    } else {
      item.status = `❓ Non résolu (${suggestions.length} suggestions ambiguës)`;
    }

    fixPlan.push(item);
  }

  return fixPlan;
}
```

- [ ] **Step 2 : Intégrer applyFixes dans main() — remplacer `const fixPlan = null`**

```js
  let fixPlan = null;
  if (opts.fix || opts.dryRun) {
    fixPlan = await applyFixes(classifiedByClient, opts.dryRun);
  }
```

- [ ] **Step 3 : Test en mode dry-run**

```bash
node server/scripts/verifyAndFixFiles.js --dry-run --client=LM
```

Résultat attendu : affiche les renommages simulés en console et le rapport inclut la section "Corrections simulées".

- [ ] **Step 4 : Commit**

```bash
git add server/scripts/verifyAndFixFiles.js
git commit -m "feat: mode --fix et --dry-run avec applyFixes et fuzzy search Gamesys"
```

---

## Task 8 : Confirmation interactive pour --fix + test final

**Files:**
- Modify: `server/scripts/verifyAndFixFiles.js`

- [ ] **Step 1 : Ajouter une confirmation avant application en mode --fix**

Ajouter la fonction `confirm` en haut du fichier (après les requires) :

```js
const readline = require("readline");

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "o" || ans.trim().toLowerCase() === "y");
    });
  });
}
```

- [ ] **Step 2 : Intégrer la confirmation dans main() avant applyFixes pour --fix**

Modifier le bloc `if (opts.fix || opts.dryRun)` dans `main()` :

```js
  let fixPlan = null;
  if (opts.dryRun) {
    fixPlan = await applyFixes(classifiedByClient, true);
  } else if (opts.fix) {
    const totalMissing = Object.values(classifiedByClient).reduce((n, c) => n + c.notInGamesys.length, 0);
    if (totalMissing === 0) {
      console.log("Aucun fichier à corriger.");
    } else {
      console.log(`\n${totalMissing} fichier(s) absent(s) de Gamesys seront traités.`);
      const ok = await confirm("Lancer la recherche et le renommage ? (o/N) : ");
      if (ok) {
        fixPlan = await applyFixes(classifiedByClient, false);
      } else {
        console.log("Annulé.");
      }
    }
  }
```

- [ ] **Step 3 : Vérifier les tests unitaires toujours verts**

```bash
npx mocha test/unit/verifyAndFixFiles.test.js
```

Résultat attendu : 7 tests passent.

- [ ] **Step 4 : Test de bout-en-bout en mode rapport**

```bash
node server/scripts/verifyAndFixFiles.js
```

Résultat attendu : scanne les 4 clients, génère `server/scripts/reports/YYYY-MM-DD-verify-files.md`.

- [ ] **Step 5 : Test en mode dry-run sur un client**

```bash
node server/scripts/verifyAndFixFiles.js --dry-run --client=CASTO
```

Résultat attendu : rapport avec section "Corrections simulées", aucun fichier touché.

- [ ] **Step 6 : Commit final**

```bash
git add server/scripts/verifyAndFixFiles.js
git commit -m "feat: confirmation interactive --fix + script verifyAndFixFiles complet"
```

---

## Self-review

**Couverture spec :**
- ✅ Scanne PDFs réseau pour LM/CASTO/BRICO/ECOM
- ✅ Vérifie chaque ref dans fs_stock (ODBC)
- ✅ Rapport Markdown dans `server/scripts/reports/`
- ✅ Mode `--fix` avec confirmation + fuzzy search + renommage
- ✅ Mode `--dry-run` sans toucher aux fichiers
- ✅ Filtre profils et teintes masse (cohérence avec code existant)
- ✅ `--client=X` pour filtrer une enseigne
- ✅ Gestion erreurs ODBC et dossier inaccessible

**Signatures cohérentes :**
- `classifyEntries(fileEntries, stockMap)` → `{ ok, noRef, notInGamesys, excluded }` utilisé partout
- `buildRenameTarget(fileName, oldRef, newRef)` → `string` utilisé dans `applyFixes`
- `fixPlan[]` items ont toujours `{ entry, suggestions, suggestion, newName, status }`

**Placeholder scan :** aucun TBD, aucune étape sans code.

**Point d'attention :** `REF_REGEX_BY_CLIENT` est importé mais non utilisé directement dans le script (il est utilisé par `buildFileEntries` en interne via `extractRefFromFilename`). L'import peut être retiré si l'implémenteur constate qu'il n'est pas nécessaire.
