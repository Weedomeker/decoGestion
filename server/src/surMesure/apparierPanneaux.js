const { decouperNom, sansRang, texteQr } = require("./imposition");

const ORDRE_ORIENTATION = { GAUCHE: 0, CENTRE: 1, DROIT: 2 };
const TOLERANCE_MM = 1;

// "101x215" (largeur x longueur, en cm) -> [2150, 1010] (longueur, largeur, en mm)
function plaqueMm(formatTauro) {
  const m = String(formatTauro || "").match(/(\d+)x(\d+)/i);
  return m ? [Number(m[2]) * 10, Number(m[1]) * 10] : null;
}

// Toutes les cotes d'un texte client, en mm : "70 x 80 + 80 x 180 MAT" donne 2 panneaux.
function extraireCotes(texte) {
  const nombre = (v) => Math.round(parseFloat(v.replace(",", ".")) * 10 * 10) / 10;
  return [...String(texte || "").matchAll(/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/g)].map((m) => ({
    largeur: nombre(m[1]),
    hauteur: nombre(m[2]),
  }));
}

function vernisDuNom(nomPdf) {
  const finition = decouperNom(nomPdf).finition.toUpperCase();
  if (finition.includes("BRILLANT")) return "BRILLANT";
  return finition.includes("MAT") ? "MAT" : null;
}

// Une place par panneau attendu, dans l'ordre de lecture gauche-droite. L'ordre des sous-dossiers
// Gamesys ne suit pas celui des pages : seule l'orientation est fiable.
function placesGamesys(lignes, nbPages) {
  const triees = lignes
    .map((ligne, i) => ({ ligne, i }))
    .sort(
      (a, b) =>
        (ORDRE_ORIENTATION[a.ligne.orientation] ?? 3) - (ORDRE_ORIENTATION[b.ligne.orientation] ?? 3) || a.i - b.i,
    )
    .map(({ ligne }) => ligne);

  const places = triees.flatMap((ligne) => {
    const cotes = extraireCotes(ligne.refClient);
    return cotes.length > 1
      ? cotes.map((cote) => ({ ligne, cote, ex: ligne.ex }))
      : [{ ligne, cote: cotes[0] || null, ex: ligne.ex }];
  });

  // Une ligne en quantité 3 pour un PDF de 3 pages : une page par exemplaire.
  const total = places.reduce((n, p) => n + (Number(p.ex) || 1), 0);
  if (places.length < nbPages && total === nbPages) {
    return places.flatMap((p) => Array.from({ length: Number(p.ex) || 1 }, () => ({ ...p, ex: 1 })));
  }
  return places;
}

const memeCote = (page, { cote }) =>
  !!cote &&
  Math.abs(cote.largeur - page.largeur) <= TOLERANCE_MM &&
  Math.abs(cote.hauteur - page.hauteur) <= TOLERANCE_MM;

const ecartCote = (page, { cote }) => Math.abs(cote.largeur - page.largeur) + Math.abs(cote.hauteur - page.hauteur);

// GAUCHE/CENTRE/DROIT, chacun sur une seule ligne : l'ordre suffit, même si une cote est fausse
// (169548 : GAUCHE à 80 cm au lieu de 100), l'écart doit alors ressortir.
function orientationsUniques(places) {
  const lignes = [...new Set(places.map((p) => p.ligne))];
  const orientations = lignes.map((l) => l.orientation);
  return orientations.every(Boolean) && new Set(orientations).size === orientations.length;
}

// Une place par page. Sinon (sans orientation, ou deux lignes GAUCHE comme 168917), la cote relie
// une page à sa ligne : les paires les plus proches d'abord, la cote exacte en premier, l'ordre
// GAUCHE/CENTRE/DROIT départageant deux cotes égales. Une cote mal saisie (169211 : « 88.8 xc 210 »)
// laisse sa ligne aux pages restantes, dans l'ordre ; tout écart est signalé.
function attribuerPlaces(pages, places) {
  if (orientationsUniques(places)) return pages.map((_, i) => places[i] || null);

  const attribuees = pages.map(() => null);
  const libres = new Set(places);
  const paires = pages
    .flatMap((page, i) =>
      page.erreur ? [] : places.map((place, j) => (place.cote ? { i, j, ecart: ecartCote(page, place) } : null)),
    )
    .filter(Boolean)
    .sort((a, b) => a.ecart - b.ecart || a.i - b.i || a.j - b.j);
  for (const { i, j } of paires) {
    if (!attribuees[i] && libres.has(places[j])) {
      attribuees[i] = places[j];
      libres.delete(places[j]);
    }
  }
  const restantes = [...libres];
  return attribuees.map((place) => place || restantes.shift() || null);
}

function ecartsDuPanneau(page, place, vernisPdf) {
  const numero = page.page + 1;
  const ecarts = [];
  const ajouter = (type, message, bloquant = false) => ecarts.push({ type, page: page.page, message, bloquant });

  if (page.erreur) {
    ajouter("echelle", `Panneau ${numero} : ${page.erreur}`, true);
    return ecarts;
  }
  if (page.hauteur < page.largeur) {
    ajouter(
      "sens",
      `Panneau ${numero} : ${page.largeur} x ${page.hauteur} mm, plus large que haut. À traiter à la main.`,
      true,
    );
  }
  if (!place) {
    ajouter("nombre", `Panneau ${numero} : aucune ligne Gamesys correspondante.`);
    return ecarts;
  }

  const { ligne, cote } = place;
  if (
    cote &&
    (Math.abs(cote.largeur - page.largeur) > TOLERANCE_MM || Math.abs(cote.hauteur - page.hauteur) > TOLERANCE_MM)
  ) {
    ajouter(
      "dimensions",
      `Panneau ${numero} : ${page.largeur / 10} x ${page.hauteur / 10} cm dans le PDF, ${cote.largeur / 10} x ${cote.hauteur / 10} cm dans Gamesys.`,
    );
  }
  if (vernisPdf && ligne.finishHint && vernisPdf !== ligne.finishHint) {
    ajouter("vernis", `Panneau ${numero} : vernis ${vernisPdf} dans le PDF, ${ligne.finishHint} dans Gamesys.`);
  }
  const plaque = plaqueMm(ligne.formatTauro);
  if (plaque && (page.hauteur > plaque[0] || page.largeur > plaque[1])) {
    ajouter(
      "plaque",
      `Panneau ${numero} : ${page.largeur / 10} x ${page.hauteur / 10} cm n'entre pas sur la plaque ${ligne.formatTauro}. Choisissez une autre plaque.`,
      true,
    );
  }
  if (ligne.matiere && !/dibond/i.test(ligne.matiere)) {
    ajouter("matiere", `Panneau ${numero} : matière « ${ligne.matiere} », seul le Dibond est prévu.`, true);
  }
  return ecarts;
}

// pages : [{ page, nom, largeur, hauteur, echelle } | { page, erreur }], dans l'ordre du PDF.
// lignes : lignes Gamesys sur-mesure de la commande (visualJobs).
function apparierPanneaux(pages, lignes, nomPdf) {
  const places = placesGamesys(lignes, pages.length);
  const vernisPdf = vernisDuNom(nomPdf);

  const attribuees = attribuerPlaces(pages, places);

  const panneaux = pages.map((page, i) => {
    const place = attribuees[i];
    return {
      ...page,
      ligneId: place?.ligne.id || null,
      ex: place?.ex ?? 1,
      vernis: vernisPdf || place?.ligne.finishHint || null,
      ecarts: ecartsDuPanneau(page, place, vernisPdf),
    };
  });

  const ecarts = [];
  if (places.length !== pages.length) {
    ecarts.push({
      type: "nombre",
      page: null,
      message: `${pages.length} panneau(x) dans le PDF, ${places.length} dans Gamesys.`,
      bloquant: false,
    });
  }
  const codes = pages.filter((p) => p.nom).map((p) => texteQr(p.nom));
  if (new Set(codes).size !== codes.length) {
    ecarts.push({ type: "qr", page: null, message: "Deux plaques auraient le même QR.", bloquant: true });
  }
  return { panneaux, ecarts };
}

const lignesRestantes = (panneaux, lignes) => lignes.filter((l) => !panneaux.some((p) => p.ligneId === l.id));

// Commande à un PDF par visuel (169847 : BOIS VARIE et BETON CLAIR) : un autre PDF de la commande
// complète les lignes restées sans panneau, seulement si chacune de ses pages a exactement la cote
// d'une de ces lignes. Une ancienne version d'un visuel déjà pris, ou une ligne sans cote, ne prouve
// rien : le PDF est écarté (null).
function complementPdf(pages, restantes, nomPdf) {
  if (pages.length === 0 || restantes.length === 0 || pages.some((p) => p.erreur)) return null;
  const { panneaux } = apparierPanneaux(pages, restantes, nomPdf);
  const coteExacte = (panneau) => {
    const ligne = restantes.find((l) => l.id === panneau.ligneId);
    return !!ligne && extraireCotes(ligne.refClient).some((cote) => memeCote(panneau, { cote }));
  };
  return panneaux.every(coteExacte) ? panneaux : null;
}

// Plusieurs PDF : le QR ne garde que 24 caractères, et « 169847 LM VALENCIENNES BOIS… » et
// « 169847 LM VALENCIENNES BETON… » en donneraient deux identiques. Chaque panneau prend son rang
// dans la commande (« 169847-2 LM … ») ; l'imposition accepte ce nom (nomDuPanneau).
const numeroterPanneaux = (panneaux) =>
  panneaux.map((p, i) => (p.nom ? { ...p, nom: sansRang(p.nom).replace(" ", `-${i + 1} `) } : p));

// Écarts de la commande entière quand ses panneaux viennent de plusieurs PDF.
function ecartsGlobaux(panneaux, lignes) {
  const ecarts = [];
  const places = placesGamesys(lignes, panneaux.length);
  if (places.length !== panneaux.length) {
    ecarts.push({
      type: "nombre",
      page: null,
      message: `${panneaux.length} panneau(x) dans les PDF, ${places.length} dans Gamesys.`,
      bloquant: false,
    });
  }
  const codes = panneaux.filter((p) => p.nom).map((p) => texteQr(p.nom));
  if (new Set(codes).size !== codes.length) {
    ecarts.push({ type: "qr", page: null, message: "Deux plaques auraient le même QR.", bloquant: true });
  }
  return ecarts;
}

module.exports = {
  apparierPanneaux,
  complementPdf,
  ecartsGlobaux,
  extraireCotes,
  lignesRestantes,
  numeroterPanneaux,
  plaqueMm,
  vernisDuNom,
};
