const REGEX_BLANC = /\+\s*BLANC/i;

export const estSurMesureVisuel = (row) => !!row.surMesure && row.surMesureKind === "visuel" && !row.teinteMasse;

// Une cote dans le texte client différente du format de la ligne : possible sur-mesure non détecté
// (169532 : « Panneau expo 60.5 x 200 cm » sur une ligne catalogue 100x210).
export function coteDifferente(row) {
  const m = String(row.refClient || "").match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return false;
  const cote = `${m[1].replace(",", ".")}x${m[2].replace(",", ".")}`;
  return cote.toLowerCase() !== String(row.formatVisu || "").toLowerCase();
}

export function statutPanneau(ecarts) {
  if (ecarts.some((e) => e.bloquant)) return "Bloqué";
  return ecarts.length ? "Écart à confirmer" : "Prêt";
}

export const ecartsAConfirmer = (panneau) =>
  !!panneau && panneau.ecarts.some((e) => !e.bloquant) && !panneau.ecartsConfirmes;

export const requeteLignes = (lignes) =>
  lignes.map(({ id, refClient, orientation, ex, formatTauro, formatVisu, matiere, finishHint }) => ({
    id,
    refClient,
    orientation,
    ex,
    formatTauro,
    formatVisu,
    matiere,
    finishHint,
  }));

// Transforme les lignes Gamesys en une ligne par panneau du PDF. Une ligne sans page garde sa place,
// décochée, pour que l'opérateur la voie.
export function lignesVersPanneaux(lignes, reponse) {
  const sansPdf = (ligne, status) => ({
    ...ligne,
    formatPath: ligne.formatPath || ligne.formatVisu || "",
    checked: false,
    status,
  });
  if (!reponse.pdf) return lignes.map((ligne) => sansPdf(ligne, "PDF sur-mesure introuvable"));

  const { pdf, candidats, panneaux, ecarts: ecartsGlobaux } = reponse;
  const lignesPanneaux = panneaux.map((p, i) => {
    const ligne = lignes.find((l) => l.id === p.ligneId) || lignes[0];
    const ecarts = [...p.ecarts, ...(i === 0 ? ecartsGlobaux : [])];
    return {
      ...ligne,
      id: `${ligne.id}-p${p.page}`,
      ex: p.ex,
      formatPath: ligne.formatVisu || ligne.formatPath || "",
      candidates: [],
      selectedFile: pdf.chemin,
      selectedFileObject: { name: pdf.chemin },
      prodBlanc: REGEX_BLANC.test(pdf.nom),
      isCredence: false,
      checked: ecarts.length === 0 && !!ligne.formatTauroValue,
      status: statutPanneau(ecarts),
      smLigne: ligne,
      smCandidats: candidats,
      smPdf: pdf.nom,
      smPanneau: {
        page: p.page,
        nom: p.nom,
        largeur: p.largeur,
        hauteur: p.hauteur,
        deco: ligne.deco || String(ligne.libelle || "").replace(/\s*\d.*$/, "").trim(),
        vernis: p.vernis || "",
        ecarts,
        ecartsConfirmes: false,
      },
    };
  });

  const utilisees = new Set(panneaux.map((p) => p.ligneId));
  const orphelines = lignes
    .filter((l) => !utilisees.has(l.id))
    .map((ligne) => sansPdf(ligne, "Aucun panneau dans ce PDF"));
  return [...lignesPanneaux, ...orphelines];
}

// Remplace les lignes sur-mesure par leurs panneaux, à la place de la première.
export function remplacerLignes(rows, estRemplacee, nouvelles) {
  const debut = rows.findIndex(estRemplacee);
  if (debut < 0) return rows;
  const reste = rows.filter((r) => !estRemplacee(r));
  const position = rows.slice(0, debut).filter((r) => !estRemplacee(r)).length;
  return [...reste.slice(0, position), ...nouvelles, ...reste.slice(position)];
}
