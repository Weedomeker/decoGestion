/**
 * One-off : corrige le champ `client` des documents Deco sur comptes "pro" (code client sans
 * préfixe enseigne : PRO###, EPROCB, I96, L558, S332, ...). Ces comptes achètent le catalogue
 * e-commerce mais les docs créés AVANT la récupération catalogue (cf. clientCatalogue.js) sont
 * restés `client:"LM"` (repli historique) avec des refs non résolues ("0"/null).
 *
 * Autorité : dossierService.listCommandesRecentes() rejoue la récupération catalogue et renvoie
 * `client:"ECOM"` pour les commandes pro éligibles. On ne touche QUE les numCmd confirmés ECOM par
 * ce mécanisme (les autres = trop anciens pour Gamesys, ou contenu non-déco → laissés tels quels).
 *
 * Deux actions :
 *   - relabel : doc pro `client != "ECOM"` sur un numCmd confirmé ECOM → `client = "ECOM"`.
 *   - dedupe (--dedupe) : si un doc pro non-ECOM à ref vide ("0"/""/null) a un jumeau
 *     (même numCmd + sousDossier) déjà en `client:"ECOM"`, le doc non-ECOM est un doublon
 *     obsolète → suppression.
 *
 * Usage :
 *   node server/scripts/backfillDecoProClient.js [Test|DecoKin] [--since 2025-01-01]   # dry-run
 *   node server/scripts/backfillDecoProClient.js DecoKin --apply                        # relabel seul
 *   node server/scripts/backfillDecoProClient.js DecoKin --apply --dedupe               # + supprime doublons
 *
 * Idempotent. Écriture directe (pas de hook Mongoose).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { MongoClient } = require("mongodb");
const dbConfig = require("../src/gamesys/config/db");
const dossierService = require("../src/gamesys/services/dossierService");

const DB_NAME = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "Test";
const APPLY = process.argv.includes("--apply");
const DEDUPE = process.argv.includes("--dedupe");
const sinceIdx = process.argv.indexOf("--since");
const SINCE = sinceIdx !== -1 ? process.argv[sinceIdx + 1] : "2025-01-01";

const KNOWN_PREFIXES = ["LM", "CAS", "BM", "ECOM"];
const hasKnownPrefix = (c) => KNOWN_PREFIXES.some((p) => String(c || "").toUpperCase().startsWith(p));
const emptyRef = (r) => r === undefined || r === null || r === "" || r === "0";
const j = (v) => JSON.stringify(v);
const sdKey = (d) => `${d.numCmd}|${d.sousDossier ?? ""}`;

async function main() {
  const uri = `${process.env.MONGO_URL}${DB_NAME}?retryWrites=true&w=majority&appName=Orphea`;
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(DB_NAME).collection("lm_commandes");

  console.log(
    `\n=== backfillDecoProClient — base ${DB_NAME} — ${APPLY ? "APPLY" : "DRY-RUN"}${DEDUPE ? " +dedupe" : ""} — since ${SINCE} ===\n`,
  );

  if (!(await dbConfig.checkOdbcConnection())) {
    console.error("ODBC indisponible — abandon.");
    await client.close();
    process.exit(1);
  }

  // Autorité Gamesys : numCmd confirmés ECOM (recovery catalogue incluse)
  const candidatsGamesys = await dossierService.listCommandesRecentes({ sinceDate: SINCE });
  const ecomCmds = new Set(candidatsGamesys.filter((c) => c.client === "ECOM").map((c) => String(c.cmd)));
  console.log(`Gamesys : ${ecomCmds.size} numCmd classés ECOM depuis ${SINCE}.\n`);

  // Docs pro mal étiquetés
  const proDocs = await col
    .find({ codeClient: { $exists: true, $nin: [null, ""] }, client: { $ne: "ECOM" } })
    .toArray();
  const bad = proDocs.filter((d) => !hasKnownPrefix(d.codeClient));

  // Index des jumeaux ECOM (même numCmd+sousDossier)
  const ecomTwins = new Set();
  if (bad.length) {
    const numCmds = [...new Set(bad.map((d) => d.numCmd))];
    const twins = await col
      .find({ numCmd: { $in: numCmds }, client: "ECOM" }, { projection: { numCmd: 1, sousDossier: 1 } })
      .toArray();
    twins.forEach((t) => ecomTwins.add(sdKey(t)));
  }

  const resume = { candidats: bad.length, relabel: 0, supprimes: 0, nonConfirmes: 0, erreurs: 0 };
  const nonConfirmesSet = new Set();

  for (const d of bad) {
    const cmd = String(d.numCmd);
    if (!ecomCmds.has(cmd)) {
      resume.nonConfirmes += 1;
      nonConfirmesSet.add(`${cmd} (codeClient=${d.codeClient}, client=${d.client})`);
      continue;
    }

    const hasEcomTwin = ecomTwins.has(sdKey(d));
    if (hasEcomTwin && emptyRef(d.ref)) {
      console.log(`  ${cmd}/${d.sousDossier ?? "--"} [${d.codeClient}] client=${j(d.client)} ref=${j(d.ref)} → DOUBLON (jumeau ECOM existe) ⇒ ${DEDUPE ? "SUPPRESSION" : "suppression (activer --dedupe)"}`);
      if (APPLY && DEDUPE) {
        try {
          await col.deleteOne({ _id: d._id });
          resume.supprimes += 1;
        } catch (e) {
          resume.erreurs += 1;
          console.log(`    ! delete échoué : ${e.message}`);
        }
      }
      continue;
    }

    console.log(`  ${cmd}/${d.sousDossier ?? "--"} [${d.codeClient}] client ${j(d.client)} → "ECOM"  (deco=${j(d.deco)} ref=${j(d.ref)} status=${j(d.status)})`);
    if (APPLY) {
      try {
        await col.updateOne({ _id: d._id }, { $set: { client: "ECOM" } });
        resume.relabel += 1;
      } catch (e) {
        resume.erreurs += 1;
        console.log(`    ! update échoué : ${e.message}`);
      }
    }
  }

  if (nonConfirmesSet.size) {
    console.log(`\n--- ${nonConfirmesSet.size} numCmd NON confirmés ECOM par Gamesys (laissés tels quels) ---`);
    [...nonConfirmesSet].forEach((s) => console.log(`  ${s}`));
  }

  console.log(
    `\nRésumé : candidats=${resume.candidats} relabel=${resume.relabel} supprimés=${resume.supprimes} nonConfirmés=${resume.nonConfirmes} erreurs=${resume.erreurs}` +
      (APPLY ? "" : "  (DRY-RUN — relancer avec --apply)"),
  );

  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(1);
});
