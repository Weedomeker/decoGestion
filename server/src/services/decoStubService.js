// Réclame le stub Deco créé proactivement depuis Gamesys (gamesysStub:true, voir
// decoGamesysStubSyncService.js) pour ce numCmd, s'il existe, plutôt que de créer un nouveau
// document. Rafraîchit au passage les champs Gamesys avec les valeurs tout juste récupérées.
// Si aucun stub n'existe (dossier pas encore synchronisé, ou stub déjà réclamé par un visuel
// précédent du même dossier), retombe sur une création classique.
async function claimStubOrCreate(Model, numCmd, data) {
  if (numCmd) {
    const claimed = await Model.findOneAndUpdate(
      { numCmd, gamesysStub: true },
      { $set: { ...data, gamesysStub: false } },
      { new: true }
    );
    if (claimed) return claimed;
  }

  const created = new Model(data);
  await created.save();
  return created;
}

// Sous-dossiers d'origine des profils/kits d'un dossier (Deco.sousDossiers, stub pkOnly) — à partir
// du tableau sousDossiers[] déjà renvoyé par dossierService.getDossierDetail (chaque élément porte
// sousNumero + ses propres profileReferences/kitPosesReferences/visualReferences, cf.
// dossierService.js:buildGroupedResponse). Un sous-dossier purement visuel est exclu. Dédupliqué
// (un sous-dossier peut rarement porter à la fois un profil et un kit).
function computeSousDossiersPkOnly(sousDossiers) {
  const suffixes = [
    ...new Set(
      (sousDossiers || [])
        .filter((sd) => (sd.profileReferences?.length || 0) + (sd.kitPosesReferences?.length || 0) > 0)
        .map((sd) => sd.sousNumero)
        .filter(Boolean),
    ),
  ];
  return suffixes.length ? suffixes : undefined;
}

module.exports = { claimStubOrCreate, computeSousDossiersPkOnly };
