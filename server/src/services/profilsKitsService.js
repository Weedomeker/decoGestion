const logger = require("../logger/logger");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test
const dossierService = require("../gamesys/services/dossierService");
const { isProfileLabel, isKitPoseLabel } = require("../gamesys/utils/reference");
const StockArticle = require("../models/StockArticle");
const ConsommationCommande = require("../models/ConsommationCommande");

function sumQtyByLabel(sousDossiers, predicate) {
  return (sousDossiers || [])
    .flatMap((s) => s.enteteDevis || [])
    .filter((e) => predicate(e.endv_identif || ""))
    .reduce((sum, e) => sum + (Number(e.endv_quant) || 0), 0);
}

async function upsertArticle(ref, fields) {
  await StockArticle.findOneAndUpdate(
    { ref },
    {
      $setOnInsert: {
        ref,
        modele: fields.modele || "",
        libelle: fields.libelle || "",
        type: fields.type,
        codeArticle: fields.codeArticle || "",
        famille: fields.famille || "",
        sousFamille: fields.sousFamille || "",
      },
    },
    { upsert: true }
  );
}

async function saveProfilsKits(job) {
  let grouped;
  try {
    grouped = await dossierService.getDossierDetail({ commande: String(job.cmd), view: "summary" });
  } catch (err) {
    logger.warn(`saveProfilsKits: getDossierDetail échoué pour cmd=${job.cmd} : ${err.message}`);
    return;
  }

  const profileReferences = grouped.profileReferences || [];
  const kitPosesReferences = grouped.kitPosesReferences || [];

  if (profileReferences.length === 0 && kitPosesReferences.length === 0) return;

  const profilQty = sumQtyByLabel(grouped.sousDossiers, isProfileLabel);
  const kitQty = sumQtyByLabel(grouped.sousDossiers, isKitPoseLabel);

  const articles = [];

  for (const r of profileReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "profil" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert profil ref=${ref} échoué : ${err.message}`);
    }
    articles.push({ ref, type: "profil", libelle: r.libelle || "", quantite: profilQty });
  }

  for (const r of kitPosesReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "kit" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert kit ref=${ref} échoué : ${err.message}`);
    }
    articles.push({ ref, type: "kit", libelle: r.libelle || "", quantite: kitQty });
  }

  if (articles.length === 0) return;

  try {
    await ConsommationCommande.create({
      numCmd: job.cmd,
      client: job.client,
      dateJob: new Date(),
      articles,
    });
  } catch (err) {
    logger.warn(`saveProfilsKits: création ConsommationCommande échouée pour cmd=${job.cmd} : ${err.message}`);
  }
}

module.exports = { saveProfilsKits };
