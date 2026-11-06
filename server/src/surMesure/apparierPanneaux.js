const { decouperNom, texteQr } = require("./imposition");

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

// Une place par page. Avec GAUCHE/CENTRE/DROIT, l'ordre suffit, même si une cote est fausse : l'écart
// doit alors ressortir. Sans orientation, seule la cote relie une page à sa ligne ; les pages sans
// cote identique prennent les lignes restantes, dans l'ordre, et leur écart est signalé.
function attribuerPlaces(pages, places) {
  if (places.every((p) => p.ligne.orientation)) return pages.map((_, i) => places[i] || null);

  const libres = [...places];
  const prendre = (place) => libres.splice(libres.indexOf(place), 1)[0];
  const attribuees = pages.map((page) => {
    const place = page.erreur ? null : libres.find((p) => memeCote(page, p));
    return place ? prendre(place) : null;
  });
  return attribuees.map((place) => place || libres.shift() || null);
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

module.exports = { apparierPanneaux, extraireCotes, plaqueMm, vernisDuNom };
