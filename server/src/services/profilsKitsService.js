const logger = require("../logger/logger");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test
const dossierService = require("../gamesys/services/dossierService");
const { isProfileLabel, isKitPoseLabel } = require("../gamesys/utils/reference");
const StockArticle = require("../models/StockArticle");
const ConsommationCommande = require("../models/ConsommationCommande");
const Deco = require("../models/Deco");

function getQtyForArticle(sousDossiers, predicate, refLibelle) {
  const allEntetes = (sousDossiers || []).flatMap((s) => s.enteteDevis || []);
  const typeEntetes = allEntetes.filter((e) => predicate(e.endv_identif || ""));
  const distinctLabels = [...new Set(typeEntetes.map((e) => e.endv_identif))];
  if (distinctLabels.length <= 1) {
    return typeEntetes.reduce((sum, e) => sum + (Number(e.endv_quant) || 0), 0);
  }
  const matched = typeEntetes.filter((e) => e.endv_identif === refLibelle);
  return (matched.length ? matched : typeEntetes).reduce((sum, e) => sum + (Number(e.endv_quant) || 0), 0);
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
        codeArticle: fields.codeTarif || "",
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

  const articles = [];

  for (const r of profileReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "profil" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert profil ref=${ref} échoué : ${err.message}`);
    }
    articles.push({ ref, type: "profil", libelle: r.libelle || "", quantite: getQtyForArticle(grouped.sousDossiers, isProfileLabel, r.libelle || "") });
  }

  for (const r of kitPosesReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "kit" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert kit ref=${ref} échoué : ${err.message}`);
    }
    articles.push({ ref, type: "kit", libelle: r.libelle || "", quantite: getQtyForArticle(grouped.sousDossiers, isKitPoseLabel, r.libelle || "") });
  }

  if (articles.length === 0) return;

  const numCmd = parseInt(job.cmd, 10);
  if (!numCmd || isNaN(numCmd)) {
    logger.warn(`saveProfilsKits: numCmd invalide (cmd=${job.cmd}), consommation ignorée`);
    return;
  }

  try {
    const existing = await ConsommationCommande.findOne({ numCmd });
    if (existing) {
      logger.info(`saveProfilsKits: ConsommationCommande déjà présente pour cmd=${job.cmd}, ignorée`);
      return null;
    }
    await ConsommationCommande.create({
      numCmd,
      client: job.client,
      dateJob: new Date(),
      articles,
    });

    if (job.isPkOnly) {
      await Deco.findOneAndUpdate(
        { numCmd, pkOnly: true },
        {
          $setOnInsert: {
            client: job.client,
            numCmd,
            mag: job.ville || "",
            date: new Date(),
            status: "",
            pkOnly: true,
          },
        },
        { upsert: true }
      );
      logger.info(`saveProfilsKits: entrée lm_commandes pkOnly créée pour cmd=${job.cmd}`);
    }

    return articles;
  } catch (err) {
    logger.warn(`saveProfilsKits: création ConsommationCommande échouée pour cmd=${job.cmd} : ${err.message}`);
  }
}

module.exports = { saveProfilsKits, getQtyForArticle };
