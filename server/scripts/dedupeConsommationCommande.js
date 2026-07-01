/**
 * Script ponctuel : détecte et supprime les doublons de `ConsommationCommande` (même numCmd),
 * en gardant le document le plus ancien par groupe, puis reconstruit l'index unique sur `numCmd`
 * (l'index existant peut avoir été créé avant l'ajout de `unique: true` au schéma — Mongoose ne
 * corrige jamais tout seul les options d'un index déjà présent en base).
 *
 * Usage :
 *   node server/scripts/dedupeConsommationCommande.js            (dry-run : affiche sans supprimer)
 *   node server/scripts/dedupeConsommationCommande.js --apply    (supprime réellement + reconstruit l'index)
 *
 * Respecte NODE_ENV comme le reste de l'app (server/src/mongoose.js) :
 * NODE_ENV=development -> base "Test", sinon -> base "DecoKin" (prod).
 * Vérifiez bien NODE_ENV avant de lancer --apply contre la prod.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const ConsommationCommande = require("../src/models/ConsommationCommande");

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".`);

  const duplicateGroups = await ConsommationCommande.aggregate([
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: "$numCmd", ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (duplicateGroups.length === 0) {
    console.log("Aucun doublon détecté.");
  } else {
    const idsToDelete = [];
    for (const group of duplicateGroups) {
      const [kept, ...rest] = group.ids;
      idsToDelete.push(...rest);
      console.log(`numCmd=${group._id} : ${group.count} documents, ${rest.length} à supprimer (conservé : ${kept})`);
    }

    console.log(`\nTotal : ${duplicateGroups.length} numCmd en doublon, ${idsToDelete.length} documents à supprimer.`);

    if (apply) {
      const result = await ConsommationCommande.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`${result.deletedCount} documents supprimés.`);
    } else {
      console.log("Mode dry-run — aucune suppression effectuée. Relancer avec --apply pour supprimer réellement.");
    }
  }

  if (apply) {
    console.log("Reconstruction de l'index unique sur numCmd (syncIndexes)...");
    const syncResult = await ConsommationCommande.syncIndexes();
    console.log("Index synchronisés :", syncResult);
  } else {
    console.log("(reconstruction de l'index ignorée en dry-run)");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur fatale :", error);
  process.exit(1);
});
