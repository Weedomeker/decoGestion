const logger = require("../logger/logger");
const ConsommationCommande = require("../models/ConsommationCommande");
const StockProfile = require("../models/StockProfile");

// Détecte les références présentes dans consommations_commandes.articles mais absentes
// du catalogue stock_profiles (cas d'un upsert StockProfile ayant échoué au moment de saveProfilsKits,
// alors que la consommation, elle, a bien été enregistrée), et les crée à partir des données déjà connues.
async function reconcileStockArticlesFromConsommations({ dryRun = false } = {}) {
  const parRef = await ConsommationCommande.aggregate([
    { $unwind: "$articles" },
    { $match: { "articles.ref": { $nin: [null, ""] } } },
    { $group: { _id: "$articles.ref", type: { $first: "$articles.type" }, libelle: { $first: "$articles.libelle" } } },
  ]);

  const refsExistantes = new Set(await StockProfile.distinct("ref"));
  const orphelines = parRef.filter((r) => !refsExistantes.has(r._id));

  if (dryRun) {
    return { orphelinsDetectes: orphelines.length, crees: 0 };
  }

  let crees = 0;
  for (const orpheline of orphelines) {
    try {
      await StockProfile.findOneAndUpdate(
        { ref: orpheline._id },
        {
          $setOnInsert: {
            ref: orpheline._id,
            type: orpheline.type,
            libelle: orpheline.libelle || "",
            modele: "",
            codeArticle: "",
            famille: "",
            sousFamille: "",
          },
        },
        { upsert: true },
      );
      crees += 1;
    } catch (err) {
      logger.warn(
        `reconcileStockArticlesFromConsommations: échec création StockProfile ref=${orpheline._id} : ${err.message}`,
      );
    }
  }

  return { orphelinsDetectes: orphelines.length, crees };
}

module.exports = { reconcileStockArticlesFromConsommations };
