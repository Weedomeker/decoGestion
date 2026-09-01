/**
 * Script-sonde (POC, lecture seule) : éprouve dossierService.fetchSyntheseCommandes — la requête
 * ensembliste unique inspirée de `docs/gamesys suivis commandes.sql` qui doit remplacer les
 * fetch* commande-par-commande des backfills de démarrage.
 *
 * Ce qu'il mesure :
 *  1. coût / volume : temps de la requête, nb de lignes, nb de commandes distinctes après Map ;
 *  2. couverture : combien de numCmd de listCommandesRecentes (même fenêtre) sont présents dans
 *     la synthèse — et inversement ;
 *  3. cohérence : sur un échantillon, compare prixTotal / dateCommande de la synthèse à
 *     getDossierCommandeInfo (chemin unitaire actuel), ainsi que nombreProfil / nombreKitPose
 *     (vs fetchDossierCommandeInfo) et mag (expression livraison, vs getDossierLivraisonDates).
 *
 * Une seule connexion ODBC réutilisée (cf. feedback_odbc_backfill_resource_limits).
 * Respecte NODE_ENV : development -> Mongo "Test", sinon "DecoKin" (prod). La sonde ne fait que
 * des lectures ; Mongo n'est utilisé que par mapDosClientToAppClient/aucune écriture.
 *
 * Usage :
 *   node server/scripts/probeSyntheseCommandes.js                 (7 jours, échantillon 15)
 *   node server/scripts/probeSyntheseCommandes.js --days=30 --sample=30
 *   node server/scripts/probeSyntheseCommandes.js --days=5 --livrables
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const dbConfig = require("../src/gamesys/config/db");
const { closeConnection } = require("../src/gamesys/lib/db");
const dossierService = require("../src/gamesys/services/dossierService");
const { chargerSyntheseCommandes } = require("../src/services/syntheseCommandesService");

function parseArgs(argv) {
  const args = { days: 7, sample: 15, livrables: false };
  for (const arg of argv) {
    const m = arg.match(/^--(days|sample)=(\d+)$/);
    if (m) args[m[1]] = parseInt(m[2], 10);
    if (arg === "--livrables") args.livrables = true;
  }
  return args;
}

function pct(n, total) {
  return total ? `${((100 * n) / total).toFixed(1)}%` : "n/a";
}

async function main() {
  const { days, sample, livrables } = parseArgs(process.argv.slice(2));
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(
    `Mongo "${mongoose.connection.name}". Fenêtre : ${days} j (depuis ${sinceDate.toISOString().slice(0, 10)}), ` +
      `seulementLivrables=${livrables}.\n`,
  );

  const connection = await dbConfig.getDbConnection();
  try {
    // 1. Requête de synthèse + Map ------------------------------------------------
    let t0 = Date.now();
    const lignes = await dossierService.fetchSyntheseCommandes(connection, {
      sinceDate,
      seulementLivrables: livrables,
    });
    const dtSql = Date.now() - t0;

    const synthese = await chargerSyntheseCommandes({ sinceDate, seulementLivrables: livrables, connection });

    console.log("=== 1. COÛT / VOLUME ===");
    console.log(`  Requête fetchSyntheseCommandes : ${dtSql} ms`);
    console.log(`  Lignes SQL mappées            : ${lignes.length}`);
    console.log(`  Commandes distinctes (Map)    : ${synthese.size}`);
    const sansNumCmd = lignes.filter((l) => !l.numCmd || Number.isNaN(l.numCmd)).length;
    const sansClient = lignes.filter((l) => !l.client).length;
    console.log(`  Lignes sans numCmd exploitable : ${sansNumCmd}`);
    console.log(`  Lignes sans client mappable    : ${sansClient}`);
    const parClient = {};
    for (const s of synthese.values()) parClient[s.client] = (parClient[s.client] || 0) + 1;
    console.log(`  Répartition par enseigne       : ${JSON.stringify(parClient)}`);

    // 2. Couverture vs listCommandesRecentes ------------------------------------
    t0 = Date.now();
    const recentes = await dossierService.listCommandesRecentes({ sinceDate });
    const dtRecentes = Date.now() - t0;
    const recentesNumCmd = new Set(
      recentes.map((c) => parseInt(c.cmd, 10)).filter((n) => n && !Number.isNaN(n)),
    );
    const manquantsDansSynthese = [...recentesNumCmd].filter((n) => !synthese.has(n));
    const enPlusDansSynthese = [...synthese.keys()].filter((n) => !recentesNumCmd.has(n));

    console.log("\n=== 2. COUVERTURE vs listCommandesRecentes ===");
    console.log(`  listCommandesRecentes         : ${recentesNumCmd.size} numCmd (${dtRecentes} ms)`);
    console.log(
      `  Présents aussi dans la synthèse : ${recentesNumCmd.size - manquantsDansSynthese.length} ` +
        `(${pct(recentesNumCmd.size - manquantsDansSynthese.length, recentesNumCmd.size)})`,
    );
    console.log(`  Manquants dans la synthèse     : ${manquantsDansSynthese.length}`);
    console.log(`     échantillon : ${manquantsDansSynthese.slice(0, 20).join(", ") || "(aucun)"}`);
    console.log(`  En plus dans la synthèse       : ${enPlusDansSynthese.length}`);
    console.log(`     échantillon : ${enPlusDansSynthese.slice(0, 20).join(", ") || "(aucun)"}`);

    // 3. Cohérence prixTotal / dateCommande sur un échantillon -----------------
    console.log(`\n=== 3. COHÉRENCE vs getDossierCommandeInfo (échantillon ${sample}) ===`);
    const echantillon = [...synthese.values()].slice(0, sample);
    // Expression `mag` = destinataire livraison, identique aux backfills (decoGamesysStubSyncService
    // / decoLivraisonDatesBackfillService) : ECOM prend le nom en premier, les enseignes physiques
    // la ville puis le repli fc_references.
    const calcMag = (o) =>
      o.client === "ECOM"
        ? o.magasin || o.ville
        : o.ville || o.magasin || o.villeRef || o.magasinRef;
    let okPrix = 0;
    let diffPrix = 0;
    let okProfil = 0;
    let diffProfil = 0;
    let okKitPose = 0;
    let diffKitPose = 0;
    let okMag = 0;
    let diffMag = 0;
    for (const s of echantillon) {
      let info = null;
      try {
        info = await dossierService.fetchDossierCommandeInfo(connection, String(s.numCmd));
      } catch (err) {
        console.log(`  numCmd=${s.numCmd} : fetchDossierCommandeInfo a échoué (${err.message})`);
        continue;
      }
      const pa = s.prixTotal;
      const pb = info?.prixTotal ?? null;
      const proche = pa != null && pb != null && Math.abs(pa - pb) < 0.02;
      if (proche || (pa == null && pb == null)) okPrix += 1;
      else {
        diffPrix += 1;
        const da = s.dateCommande ? s.dateCommande.toISOString().slice(0, 10) : "null";
        const db = info?.dateCommande ? new Date(info.dateCommande).toISOString().slice(0, 10) : "null";
        console.log(
          `  numCmd=${s.numCmd} client=${s.client} : synthèse prix=${pa} date=${da} | ` +
            `commandeInfo prix=${pb} date=${db}`,
        );
      }

      // nombreProfil / nombreKitPose vs fetchDossierCommandeInfo (chemin unitaire).
      const npa = Number(s.nombreProfil) || 0;
      const npb = Number(info?.nombreProfil) || 0;
      if (npa === npb) okProfil += 1;
      else {
        diffProfil += 1;
        console.log(`  numCmd=${s.numCmd} : nombreProfil synthèse=${npa} | commandeInfo=${npb}`);
      }
      const nka = Number(s.nombreKitPose) || 0;
      const nkb = Number(info?.nombreKitPose) || 0;
      if (nka === nkb) okKitPose += 1;
      else {
        diffKitPose += 1;
        console.log(`  numCmd=${s.numCmd} : nombreKitPose synthèse=${nka} | commandeInfo=${nkb}`);
      }

      // mag : expression livraison synthèse vs getDossierLivraisonDates (helper à-la-volée).
      let liv = null;
      try {
        liv = await dossierService.getDossierLivraisonDates(String(s.numCmd));
      } catch (err) {
        console.log(`  numCmd=${s.numCmd} : getDossierLivraisonDates a échoué (${err.message})`);
        continue;
      }
      const magSynth = calcMag(s) || null;
      const magFallback = calcMag({ client: s.client, ...liv }) || null;
      if (magSynth === magFallback) okMag += 1;
      else {
        diffMag += 1;
        console.log(
          `  numCmd=${s.numCmd} client=${s.client} : mag synthèse=${JSON.stringify(magSynth)} | ` +
            `fallback=${JSON.stringify(magFallback)}`,
        );
      }
    }
    console.log(`  Prix cohérent    : ${okPrix}/${echantillon.length} — divergences : ${diffPrix}`);
    console.log(`  nombreProfil     : ${okProfil}/${echantillon.length} — divergences : ${diffProfil}`);
    console.log(`  nombreKitPose    : ${okKitPose}/${echantillon.length} — divergences : ${diffKitPose}`);
    console.log(`  mag (livraison)  : ${okMag}/${echantillon.length} — divergences : ${diffMag}`);

    // Aperçu brut de 3 lignes -------------------------------------------------
    console.log("\n=== APERÇU (3 premières entrées de la Map) ===");
    for (const s of [...synthese.values()].slice(0, 3)) console.log(JSON.stringify(s));
  } finally {
    await closeConnection(connection);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
