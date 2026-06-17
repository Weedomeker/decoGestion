"use strict";
process.env.NODE_ENV = "development";

const path = require("path");
const fs = require("fs");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { checkOdbcConnection } = require("../src/gamesys/config/db");
const { withDbConnection, query } = require("../src/gamesys/lib/db");
const { findStockByRefs } = require("../src/gamesys/services/stockReferenceLookupService");
const { buildFileEntries } = require("../src/services/referencesCheckService");
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

// ─── Rapport Markdown ─────────────────────────────────────────────────────────

function generateMarkdownReport(classifiedByClient, fixPlan, opts) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const mode = opts.fix ? "--fix" : opts.dryRun ? "--dry-run" : "rapport uniquement";

  const clientList = Object.keys(classifiedByClient);

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

// ─── Fix / Dry-run ────────────────────────────────────────────────────────────

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

// ─── I/O : fuzzy search fs_stock ─────────────────────────────────────────────

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
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k.toUpperCase(), v]));
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "o" || ans.trim().toLowerCase() === "y");
    });
  });
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

  const filesByClient = scanAllClients(config, clients);
  const stockMap = await lookupAllClients(filesByClient);

  const classifiedByClient = {};
  for (const client of clients) {
    classifiedByClient[client] = classifyEntries(filesByClient[client] || [], stockMap);
  }

  for (const client of clients) {
    const { ok, noRef, notInGamesys, excluded } = classifiedByClient[client];
    console.log(`${client} : ${ok.length} OK | ${notInGamesys.length} absents Gamesys | ${noRef.length} ref non extraite | ${excluded.length} exclus`);
  }

  let fixPlan = null;
  if (opts.dryRun) {
    fixPlan = await applyFixes(classifiedByClient, true);
  }

  const md = generateMarkdownReport(classifiedByClient, fixPlan, opts);
  writeReport(md, opts);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});

module.exports = { buildRenameTarget, classifyEntries };
