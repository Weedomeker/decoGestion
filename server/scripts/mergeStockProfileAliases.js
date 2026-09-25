/**
 * Script one-shot : fusion des StockProfile alias dans leur doc canonique.
 *
 * Pour chaque groupe (canonical + aliases) :
 *   - additionne les stockDisponible des docs alias dans le canonique ($inc)
 *   - ajoute les refs alias dans canonique.aliases ($addToSet)
 *   - supprime les docs alias
 *
 * Usage :
 *   node server/scripts/mergeStockProfileAliases.js           (dry-run)
 *   node server/scripts/mergeStockProfileAliases.js --apply   (applique)
 *
 * NODE_ENV=development -> base "Test", sinon -> "DecoKin" (prod).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../src/mongoose");
const StockProfile = require("../src/models/StockProfile");

// Groupes identifiés manuellement — canonical = ref numérique LM, aliases = refs MURANEO + ECOM
const GROUPS = [
  { canonical: "94953589", aliases: ["MU-PROFMAT255A", "PROFMAT255A"],    libelle: "Alu Mat - A - Finition 255cm" },
  { canonical: "94956075", aliases: ["PROFMAT255B"],                       libelle: "Alu Mat - B - Raccord 255cm" },
  { canonical: "94953689", aliases: ["MU-PROFMAT255C", "PROFMAT255C"],    libelle: "Alu Mat - C - Intérieur 255cm" },
  { canonical: "94964465", aliases: ["PROFBLC255A"],                       libelle: "Blanc Mat - A - Finition 255cm" },
  { canonical: "94964389", aliases: ["MU-PROFBLC255C", "PROFBLC255C"],    libelle: "Blanc Mat - C - Intérieur 255cm" },
  { canonical: "94953570", aliases: ["PROFBRILL255A"],                     libelle: "Alu Brillant - A - Finition 255cm" },
  { canonical: "94956914", aliases: ["PROFBRILL255C"],                     libelle: "Alu Brillant - C - Intérieur 255cm" },
  { canonical: "94964442", aliases: ["PROFNOIR255A"],                      libelle: "Noir Mat - A - Finition 255cm" },
  { canonical: "94964473", aliases: ["MU-PROFNOIR255C", "PROFNOIR255C"],  libelle: "Noir Mat - C - Intérieur 255cm" },
  { canonical: "94964421", aliases: ["PROFOR255A"],                        libelle: "Or Mat - A - Finition 255cm" },
  { canonical: "94964374", aliases: ["MU-PROFOR255C", "PROFOR255C"],      libelle: "Or Mat - C - Intérieur 255cm" },
];

async function processGroup(group, dryRun) {
  const canonicalDoc = await StockProfile.findOne({ ref: group.canonical }).lean();
  if (!canonicalDoc) {
    return { status: "SKIP", reason: `Doc canonique ${group.canonical} introuvable` };
  }

  const aliasDocs = await StockProfile.find({ ref: { $in: group.aliases } }).lean();
  if (aliasDocs.length === 0) {
    // Aliases déjà supprimés ou jamais créés — vérifier que aliases est bien renseigné
    const aliasesManquants = group.aliases.filter((a) => !(canonicalDoc.aliases || []).includes(a));
    if (aliasesManquants.length === 0) {
      return { status: "ALREADY_DONE" };
    }
    if (!dryRun) {
      await StockProfile.updateOne({ ref: group.canonical }, { $addToSet: { aliases: { $each: aliasesManquants } } });
    }
    return { status: "ALIASES_ONLY", aliasesAjoutes: aliasesManquants };
  }

  const stockAjoute = aliasDocs.reduce((sum, d) => sum + (d.stockDisponible || 0), 0);
  const refsSupprimes = aliasDocs.map((d) => d.ref);

  if (!dryRun) {
    const update = { $addToSet: { aliases: { $each: group.aliases } } };
    if (stockAjoute !== 0) update.$inc = { stockDisponible: stockAjoute };
    await StockProfile.updateOne({ ref: group.canonical }, update);
    await StockProfile.deleteMany({ ref: { $in: refsSupprimes } });
  }

  return {
    status: dryRun ? "DRY_RUN" : "DONE",
    stockAjoute,
    refsSupprimes,
    stockCanonicalAvant: canonicalDoc.stockDisponible,
    stockCanonicalApres: canonicalDoc.stockDisponible + stockAjoute,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`NODE_ENV=${process.env.NODE_ENV || "(non défini)"} — connexion MongoDB...`);
  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB indisponible, abandon.");
    process.exit(1);
  }
  console.log(`Connecté à la base "${mongoose.connection.name}".\n`);

  for (const group of GROUPS) {
    const result = await processGroup(group, !apply);
    const prefix = apply ? "[APPLIQUÉ]" : "[DRY-RUN]";
    if (result.status === "SKIP") {
      console.log(`${prefix} SKIP  ${group.libelle} — ${result.reason}`);
    } else if (result.status === "ALREADY_DONE") {
      console.log(`${prefix} OK    ${group.libelle} — déjà fusionné`);
    } else if (result.status === "ALIASES_ONLY") {
      console.log(`${prefix} ALIAS ${group.libelle} — aliases ajoutés : ${result.aliasesAjoutes.join(", ")}`);
    } else {
      console.log(
        `${prefix} MERGE ${group.libelle}` +
        `\n         canonical=${group.canonical}` +
        `\n         supprimés : ${result.refsSupprimes.join(", ")}` +
        `\n         stock : ${result.stockCanonicalAvant} + ${result.stockAjoute} = ${result.stockCanonicalApres}`,
      );
    }
  }

  if (!apply) {
    console.log("\nMode dry-run — aucune donnée écrite. Relancer avec --apply pour appliquer.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
