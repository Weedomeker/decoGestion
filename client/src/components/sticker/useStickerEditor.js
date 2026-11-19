import { useCallback, useReducer } from "react";
import { nouvelId } from "./geometrie";

const MAX_HISTORIQUE = 60;

// passe / present / futur : annuler-rétablir. Un glisser n'écrit qu'une entrée (memoriser au début).
function reducer(etat, action) {
  switch (action.type) {
    case "charger":
      // modifie : une étiquette neuve (pas encore en base) compte comme modifiée, pour ne pas être
      // remplacée par le modèle d'une enseigne quand le client du formulaire change.
      return { passe: [], present: action.elements, futur: [], selection: null, modifie: Boolean(action.modifie) };
    case "memoriser":
      return { ...etat, passe: [...etat.passe, etat.present].slice(-MAX_HISTORIQUE), futur: [] };
    case "appliquer": {
      const present = action.fn(etat.present);
      if (present === etat.present) return etat;
      const passe = action.memoriser ? [...etat.passe, etat.present].slice(-MAX_HISTORIQUE) : etat.passe;
      return { ...etat, passe, present, futur: action.memoriser ? [] : etat.futur, modifie: true };
    }
    case "annuler": {
      if (!etat.passe.length) return etat;
      const present = etat.passe[etat.passe.length - 1];
      return { ...etat, passe: etat.passe.slice(0, -1), present, futur: [etat.present, ...etat.futur], modifie: true };
    }
    case "retablir": {
      if (!etat.futur.length) return etat;
      const [present, ...futur] = etat.futur;
      return { ...etat, passe: [...etat.passe, etat.present], present, futur, modifie: true };
    }
    case "selectionner":
      return { ...etat, selection: action.id };
    case "enregistre":
      return { ...etat, modifie: false };
    default:
      return etat;
  }
}

export default function useStickerEditor() {
  const [etat, dispatch] = useReducer(reducer, {
    passe: [],
    present: [],
    futur: [],
    selection: null,
    modifie: false,
  });

  const appliquer = useCallback((fn, memoriser = true) => dispatch({ type: "appliquer", fn, memoriser }), []);
  const selectionner = useCallback((id) => dispatch({ type: "selectionner", id }), []);

  const modifier = useCallback(
    (id, patch, memoriser = true) =>
      appliquer((els) => els.map((e) => (e.id === id ? { ...e, ...patch } : e)), memoriser),
    [appliquer],
  );

  const ajouter = useCallback(
    (element) => {
      appliquer((els) => [...els, element]);
      selectionner(element.id);
    },
    [appliquer, selectionner],
  );

  const supprimer = useCallback(
    (id) => {
      appliquer((els) => els.filter((e) => e.id !== id));
      selectionner(null);
    },
    [appliquer, selectionner],
  );

  const dupliquer = useCallback(
    (id) => {
      const source = etat.present.find((e) => e.id === id);
      if (!source) return;
      const copie = { ...source, id: nouvelId(), x: source.x + 3, y: source.y + 3 };
      appliquer((els) => {
        const i = els.findIndex((e) => e.id === id);
        return [...els.slice(0, i + 1), copie, ...els.slice(i + 1)];
      });
      selectionner(copie.id);
    },
    [etat.present, appliquer, selectionner],
  );

  // L'ordre de la liste est l'ordre de dessin : le dernier est au premier plan.
  const deplacerPlan = useCallback(
    (id, sens) =>
      appliquer((els) => {
        const i = els.findIndex((e) => e.id === id);
        const j = sens === "avant" ? Math.min(els.length - 1, i + 1) : Math.max(0, i - 1);
        if (i < 0 || i === j) return els;
        const copie = [...els];
        [copie[i], copie[j]] = [copie[j], copie[i]];
        return copie;
      }),
    [appliquer],
  );

  return {
    elements: etat.present,
    selection: etat.selection,
    elementSelectionne: etat.present.find((e) => e.id === etat.selection) || null,
    modifie: etat.modifie,
    peutAnnuler: etat.passe.length > 0,
    peutRetablir: etat.futur.length > 0,
    charger: useCallback(
      (elements, modifie = false) => dispatch({ type: "charger", elements: elements || [], modifie }),
      [],
    ),
    memoriser: useCallback(() => dispatch({ type: "memoriser" }), []),
    marquerEnregistre: useCallback(() => dispatch({ type: "enregistre" }), []),
    annuler: useCallback(() => dispatch({ type: "annuler" }), []),
    retablir: useCallback(() => dispatch({ type: "retablir" }), []),
    selectionner,
    modifier,
    ajouter,
    supprimer,
    dupliquer,
    deplacerPlan,
  };
}
