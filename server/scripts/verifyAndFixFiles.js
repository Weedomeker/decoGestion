"use strict";
process.env.NODE_ENV = "development";

const path = require("path");
const fs = require("fs");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const refModels = require("../src/services/refModels"); // { LM: RefDeco, CASTO: RefCasto, BRICO: RefBrico, ECOM: RefEcom }
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
  const noRefAll = Object.values(classifiedByClient).flatMap((c) => c.noRef);
  const toProcess = [...notInGamesysAll, ...noRefAll];

  if (toProcess.length === 0) {
    console.log("Aucun fichier à corriger.");
    return fixPlan;
  }

  console.log(
    `\nRecherche Gamesys pour ${toProcess.length} fichier(s) (${notInGamesysAll.length} absents + ${noRefAll.length} sans ref)...`
  );

  for (const entry of toProcess) {
    let suggestions = await fuzzySearchRef(entry);
    let source = "gamesys";

    // Fallback MongoDB si Gamesys ne trouve rien (ou ambiguïté non résolue)
    if (suggestions.length !== 1) {
      const mongoSuggestions = await fuzzySearchRefInMongo(entry);
      if (mongoSuggestions.length === 1 || (mongoSuggestions.length > 0 && suggestions.length === 0)) {
        suggestions = mongoSuggestions;
        source = "mongodb";
      }
    }

    const item = { entry, suggestions, suggestion: null, newName: null, status: "", source };

    if (suggestions.length === 1) {
      const sug = suggestions[0];
      let newName;
      if (entry.ref) {
        newName = buildRenameTarget(entry.fileName, entry.ref, sug.ref);
      } else {
        // Fichier sans ref extraite : détecter et remplacer tout code existant
        const oldCode =
          entry.fileName.match(/\d{8}/)?.[0] ||       // 00000000, 94963962 …
          entry.fileName.match(/[A-Z]{3,}\d{2,}/)?.[0]; // JASPED00, JASPED01 …
        if (oldCode) {
          newName = entry.fileName.replace(oldCode, sug.ref);
        } else {
          const ext = path.extname(entry.fileName);
          const base = path.basename(entry.fileName, ext);
          newName = `${base} ${sug.ref}${ext}`;
        }
      }
      item.suggestion = sug;
      item.newName = newName;

      const srcLabel = source === "mongodb" ? " [Mongo]" : "";
      if (newName === entry.fileName) {
        item.status = "⏭️ Nom identique — ignoré";
      } else if (isDryRun) {
        item.status = `🔵 Simulé${srcLabel} (--dry-run)`;
        console.log(`  [DRY-RUN${srcLabel}] ${entry.fileName} → ${newName}`);
      } else {
        const newPath = path.join(path.dirname(entry.filePath), newName);
        try {
          fs.renameSync(entry.filePath, newPath);
          item.status = `✅ Renommé${srcLabel}`;
          console.log(`  ✅${srcLabel} ${entry.fileName} → ${newName}`);
        } catch (e) {
          item.status = `❌ Échec : ${e.message}`;
          console.error(`  ❌ Impossible de renommer ${entry.fileName} : ${e.message}`);
        }
      }
    } else if (suggestions.length === 0) {
      item.status = "❓ Non résolu (0 suggestion Gamesys+Mongo)";
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

async function fuzzySearchRef(entry) {
  const baseName = path.basename(entry.fileName, ".pdf");

  // "DUN" = contraction de "d'un" (apostrophe absente dans nos termes mais dans Gamesys)
  const STOP_WORDS = new Set(["MAT", "THE", "LES", "DUN", "SUR"]);
  // Gamesys utilise "Droit" (masculin) même quand le fichier dit "DROITE" (féminin)
  const normTerm = (t) => (t === "DROITE" ? "DROIT" : t);

  const allTerms = getSearchTerms(baseName)
    .filter((t) => t !== "00000000")
    .filter((t) => !STOP_WORDS.has(t))
    .map(normTerm);

  if (allTerms.length < 2) return [];

  // Enlever les accents pour la comparaison de scoring (éclat → ECLAT, soufflé → SOUFFLE…)
  const stripAccents = (s) =>
    String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

  const filenameNormSet = new Set(allTerms.map(stripAccents));

  // Format de ref attendu par client — pour éliminer les faux positifs (ex: TG01 pour BRICO)
  const CLIENT_REF_PATTERN = {
    LM: /^\d{8}$|^[A-Z]+\d*-\d+$/,
    CASTO: /^\d{13}$/,
    BRICO: /^[A-Z]+\d*-\d+$/,
    ECOM: /^[A-Z]+\d*-\d+$/,
  };
  const refPattern = CLIENT_REF_PATTERN[entry.client];

  // Requête SQL : lib_1, lib_2 ET st_modele (le code modèle ne contient pas d'accents)
  const search = async (terms) => {
    const cond = terms
      .map(() => "(st_lib_1_conso ILIKE ? OR st_lib_2_conso ILIKE ? OR st_modele ILIKE ?)")
      .join(" AND ");
    const params = terms.flatMap((t) => [`%${t}%`, `%${t}%`, `%${t}%`]);
    const sql = `SELECT st_art_ref_client, st_art_gencod, st_lib_1_conso, st_lib_2_conso, st_modele
                 FROM public.fs_stock WHERE ${cond} LIMIT 20`;
    const rows = await withDbConnection((c) => query(c, sql, params));
    return rows
      .map((row) => ({
        ref: String(row.st_art_ref_client || "").trim() || String(row.st_art_gencod || "").trim(),
        libelle: [row.st_lib_1_conso, row.st_lib_2_conso].filter(Boolean).join(" — "),
        modele: String(row.st_modele || "").trim(),
      }))
      .filter((c) => c.ref)
      .filter((c) => !refPattern || refPattern.test(c.ref)); // exclure les refs hors format client
  };

  // Scoring avec labels normalisés (accents supprimés)
  // Positif : termes inutilisés du fichier présents dans le libellé
  // Négatif : mots longs du libellé absents du nom de fichier (variantes non désirées : SOUFFLE, ECLAT, UNI…)
  const scoreAndResolve = (candidates, usedTerms) => {
    if (candidates.length === 1) return candidates;
    const unused = allTerms.filter((t) => !new Set(usedTerms).has(t));
    const scored = candidates.map((c) => {
      const labelNorm = stripAccents(`${c.libelle} ${c.modele}`);
      let sc = unused.filter((t) => labelNorm.includes(stripAccents(t))).length;
      // Pénalité légère pour chaque mot ≥ 4 lettres du libellé absent du nom de fichier
      const labelWords = labelNorm.match(/[A-Z]{4,}/g) || [];
      for (const w of labelWords) {
        if (!filenameNormSet.has(w) && !allTerms.some((t) => stripAccents(t) === w)) sc -= 0.5;
      }
      return { ...c, score: sc };
    });
    const max = Math.max(...scored.map((s) => s.score));
    const best = scored.filter((s) => s.score === max);
    return best;
  };

  // 1. Tentatives progressives : 5 → 4 → 3 → 2 termes (préfixe ordonné)
  const termCounts = [...new Set([Math.min(allTerms.length, 5), 4, 3, 2])];
  for (const n of termCounts) {
    if (n > allTerms.length) continue;
    const terms = allTerms.slice(0, n);
    const candidates = await search(terms);
    if (candidates.length === 0) continue;
    const best = scoreAndResolve(candidates, terms);
    if (best.length === 1) return best;
    if (n === 2) return best; // dernier recours : retourner même si ambigu
  }

  // 2. Fallback : premier terme textuel + tous les termes numériques (ex: U535 + 100 + 255)
  //    Utile quand les termes descriptifs ont des accents absents de nos termes (rêveur, café…)
  const textTerms = allTerms.filter((t) => /[A-Z]/.test(t));
  const numTerms = allTerms.filter((t) => /^\d+$/.test(t));
  if (textTerms.length >= 1 && numTerms.length >= 1) {
    const fbTerms = [textTerms[0], ...numTerms].slice(0, 4);
    const fbKey = JSON.stringify(fbTerms);
    const alreadyTried = termCounts.some((n) => JSON.stringify(allTerms.slice(0, n)) === fbKey);
    if (!alreadyTried) {
      const candidates = await search(fbTerms);
      if (candidates.length > 0) {
        const best = scoreAndResolve(candidates, fbTerms);
        if (best.length === 1) return best;
        if (best.length > 0) return best;
      }
    }
  }

  return [];
}

// ─── I/O : fuzzy search MongoDB RefModel ─────────────────────────────────────

async function fuzzySearchRefInMongo(entry) {
  const RefModel = refModels[entry.client];
  if (!RefModel) return [];

  const baseName = path.basename(entry.fileName, ".pdf");
  const allTerms = getSearchTerms(baseName).filter((t) => t !== "00000000");
  if (allTerms.length < 2) return [];

  const termCounts = [...new Set([Math.min(allTerms.length, 4), 3, 2])].filter((n) => n >= 2);

  for (const n of termCounts) {
    const terms = allTerms.slice(0, n);
    const andConditions = terms.map((t) => ({ model: new RegExp(t, "i") }));
    // Filtrer par format si disponible (normaliser x/X)
    if (entry.format) {
      andConditions.push({ format: new RegExp(entry.format.replace("x", "[xX]"), "i") });
    }

    const docs = await RefModel.find({ $and: andConditions }).limit(10).lean();
    const candidates = docs
      .map((doc) => ({
        ref: String(doc.ref || "").trim(),
        libelle: String(doc.model || "").trim(),
        modele: String(doc.model || "").trim(),
        format: String(doc.format || "").trim(),
        source: "mongodb",
      }))
      .filter((c) => c.ref);

    if (candidates.length === 0) continue;
    if (candidates.length === 1) return candidates;

    const usedSet = new Set(terms);
    const scoringTerms = allTerms.filter((t) => !usedSet.has(t));
    if (scoringTerms.length > 0) {
      const scored = candidates.map((c) => {
        const label = `${c.libelle} ${c.format}`.toUpperCase();
        const score = scoringTerms.filter((t) => label.includes(t)).length;
        return { ...c, score };
      });
      const maxScore = Math.max(...scored.map((s) => s.score));
      const best = scored.filter((s) => s.score === maxScore);
      if (best.length === 1) return [best[0]];
      return best;
    }

    return candidates;
  }

  return [];
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
  console.log("✅ ODBC OK");

  console.log("Connexion MongoDB...");
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.warn("⚠️  MongoDB indisponible — la recherche MongoDB sera ignorée.");
  } else {
    console.log("✅ MongoDB OK\n");
  }

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
  } else if (opts.fix) {
    const totalMissing = Object.values(classifiedByClient).reduce((n, c) => n + c.notInGamesys.length + c.noRef.length, 0);
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

  const md = generateMarkdownReport(classifiedByClient, fixPlan, opts);
  writeReport(md, opts);

  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});

module.exports = { buildRenameTarget, classifyEntries };
