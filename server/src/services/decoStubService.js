// Réclame le stub Deco créé proactivement depuis Gamesys (gamesysStub:true, voir
// decoGamesysStubSyncService.js) pour ce numCmd, s'il existe, plutôt que de créer un nouveau
// document. Rafraîchit au passage les champs Gamesys avec les valeurs tout juste récupérées.
// Depuis que la sync proactive crée un stub par sous-dossier visuel (et non plus un seul par
// numCmd), on filtre aussi sur sousDossier quand le job le connaît (job.sousDossier, transmis par
// le frontend via la recherche de dossier) — sans ce filtre, une commande à plusieurs visuels
// risquerait de réclamer le stub d'un AUTRE panneau que celui réellement traité.
// Quand le job ne connaît PAS son sousDossier (saisie manuelle, ou stub pkOnly qui n'en a jamais),
// on ne réclame QUE les stubs génériques sans sousDossier (le stub racine "métadonnées commande"
// créé quand aucun visuel n'a pu être résolu) — jamais un stub par sous-dossier appartenant à un
// AUTRE visuel de la même commande. Vérifié empiriquement : sans cette restriction, un job sans
// sousDossier connu réclamait (et écrasait) le stub du 1er visuel trouvé au lieu d'en créer un
// nouveau, faisant perdre les données Gamesys de ce visuel non concerné.
// Si aucun stub ne correspond par sousDossier, mais que le job connaît sa ref catalogue (flux de
// saisie manuelle, qui n'a jamais de sousDossier Gamesys — cf. plus haut — ou tout autre appelant
// qui ne l'aurait pas transmis), on retente en réclamant le stub qui porte cette MÊME ref pour ce
// numCmd : contrairement à sousDossier, ref identifie le panneau sans ambiguïté (SKU/référence
// catalogue précis), donc pas de risque de réclamer le stub d'un autre visuel même sans connaître
// le sous-dossier Gamesys. Vérifié en prod (commandes 167731/167733/167735/167741) : sans ce repli,
// un job soumis sans sousDossier connu mais avec la bonne ref créait un doublon à côté du stub par
// sous-dossier existant au lieu de le réclamer, laissant ce dernier bloqué à "A lancer" pour
// toujours.
// Si rien ne correspond (dossier pas encore synchronisé, ou stub déjà réclamé), retombe sur une
// création classique.
async function claimStubOrCreate(Model, numCmd, data) {
  if (numCmd) {
    const filter = { numCmd, gamesysStub: true };
    filter.sousDossier = data.sousDossier ? data.sousDossier : { $in: [null, ""] };
    const claimed = await Model.findOneAndUpdate(filter, { $set: { ...data, gamesysStub: false } }, { new: true });
    if (claimed) return claimed;

    if (!data.sousDossier && data.ref) {
      const claimedByRef = await Model.findOneAndUpdate(
        { numCmd, gamesysStub: true, ref: data.ref },
        { $set: { ...data, gamesysStub: false } },
        { new: true },
      );
      if (claimedByRef) return claimedByRef;
    }
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
