const Deco = require("../models/Deco");

// Détecte et supprime les stubs Gamesys par sous-dossier (gamesysStub:true, status:"A lancer",
// sousDossier posé) devenus orphelins : le job correspondant a été traité via le flux normal de
// l'appli sans transmettre job.sousDossier au frontend, donc claimStubOrCreate (decoStubService.js)
// n'a pas pu réclamer le stub du bon panneau — par sécurité, il ne réclame QUE les stubs SANS
// sousDossier quand le job ne connaît pas le sien, pour ne jamais risquer de réclamer le stub d'un
// AUTRE panneau de la même commande — et a donc créé un nouveau document à côté, laissant le stub
// original bloqué à "A lancer" indéfiniment. Un doublon est détecté par même numCmd + même ref sur un
// autre document déjà traité (gamesysStub != true) — ref (pas deco) car deux panneaux distincts d'une
// même commande (ex: variantes Gauche/Droite d'un même décor) peuvent légitimement partager le même
// deco avec des ref différentes : matcher sur deco risquerait de supprimer le stub d'un panneau encore
// réellement en attente simplement parce qu'un AUTRE panneau du même décor a déjà été traité. Les
// stubs sans ref exploitable (repli Gamesys sans catalogue, cf. decoGamesysStubSyncService.js) sont
// ignorés : rien de fiable à matcher.
async function cleanupDecoGamesysStubDuplicates({ dryRun = true } = {}) {
  const stubs = await Deco.find({
    gamesysStub: true,
    status: "A lancer",
    sousDossier: { $exists: true, $ne: "" },
    ref: { $nin: [null, ""] },
  })
    .select({ numCmd: 1, sousDossier: 1, deco: 1, ref: 1 })
    .lean();

  const doublons = [];
  for (const stub of stubs) {
    const sibling = await Deco.exists({ numCmd: stub.numCmd, ref: stub.ref, gamesysStub: { $ne: true } });
    if (sibling) doublons.push(stub);
  }

  const resume = {
    candidats: stubs.length,
    doublons: doublons.length,
    numCmds: [...new Set(doublons.map((d) => d.numCmd))],
    supprimes: 0,
  };

  if (dryRun || doublons.length === 0) return resume;

  const { deletedCount } = await Deco.deleteMany({ _id: { $in: doublons.map((d) => d._id) } });
  resume.supprimes = deletedCount;

  return resume;
}

module.exports = { cleanupDecoGamesysStubDuplicates };
