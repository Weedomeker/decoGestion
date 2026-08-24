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

module.exports = { claimStubOrCreate };
