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

const orientationLue = (page) => page.marque?.orientation || null;

// La page dit GAUCHE, la ligne dit DROIT.
const conflit = (page, place) =>
  !!orientationLue(page) && !!place.ligne.orientation && orientationLue(page) !== place.ligne.orientation;

// Une place par page. L'orientation écrite en marge de la page passe avant tout : elle relie la page
// à la ligne de même orientation, même si une cote est fausse. Sans elle, et sans orientation unique
// par ligne (deux lignes GAUCHE comme 168917), la cote relie une page à sa ligne : les paires les plus
// proches d'abord, la cote exacte en premier, l'ordre GAUCHE/CENTRE/DROIT départageant deux cotes
// égales. Une cote mal saisie (169211 : « 88.8 xc 210 ») laisse sa ligne aux pages restantes, dans
// l'ordre ; tout écart est signalé, et tout doute sur la place d'une page (doutePlace).
function attribuerPlaces(pages, places) {
  if (!pages.some(orientationLue) && orientationsUniques(places)) return pages.map((_, i) => places[i] || null);

  const attribuees = pages.map(() => null);
  const libres = new Set(places);
  const paires = pages
    .flatMap((page, i) =>
      page.erreur
        ? []
        : places.map((place, j) =>
            place.cote ? { i, j, conflit: Number(conflit(page, place)), ecart: ecartCote(page, place) } : null,
          ),
    )
    .filter(Boolean)
    .sort((a, b) => a.conflit - b.conflit || a.ecart - b.ecart || a.i - b.i || a.j - b.j);
  for (const { i, j } of paires) {
    if (!attribuees[i] && libres.has(places[j])) {
      attribuees[i] = places[j];
      libres.delete(places[j]);
    }
  }
  const restantes = [...libres];
  return attribuees.map((place, i) => {
    if (place) return place;
    const k = Math.max(
      0,
      restantes.findIndex((r) => !conflit(pages[i], r)),
    );
    return restantes.splice(k, 1)[0] || null;
  });
}

const cm = (mm) => String(mm / 10).replace(".", ",");
const decrire = ({ ligne, cote }) =>
  [ligne.orientation || "la ligne sans orientation", cote && `${cm(cote.largeur)} x ${cm(cote.hauteur)} cm`]
    .filter(Boolean)
    .join(" ");

// Deux places qu'on peut échanger sans rien changer : même ligne, ou mêmes orientation, cote,
// vernis, quantité, plaque et matière.
const interchangeables = (a, b) =>
  a === b ||
  a.ligne === b.ligne ||
  ((a.ligne.orientation || null) === (b.ligne.orientation || null) &&
    (Number(a.ex) || 1) === (Number(b.ex) || 1) &&
    (a.ligne.finishHint || null) === (b.ligne.finishHint || null) &&
    a.ligne.formatTauro === b.ligne.formatTauro &&
    a.ligne.matiere === b.ligne.matiere &&
    ((!a.cote && !b.cote) || (!!a.cote && !!b.cote && memeCote(a.cote, b))));

// Pas droit à l'erreur sur la place d'un panneau. Elle est sûre si aucune autre ligne ne peut
// prendre la page (orientation lue différente, ou ligne interchangeable), ou si la page désigne sa
// ligne (orientation lue identique, ou cote exacte) et que la cote écarte toutes les autres.
// Sinon, à confirmer.
function doutePlace(page, place, places) {
  if (!place || page.erreur) return null;
  const numero = page.page + 1;
  const lue = orientationLue(page);
  if (conflit(page, place)) {
    return `Page ${numero} marquée ${lue} dans le PDF, reliée à ${decrire(place)} dans Gamesys. À vérifier.`;
  }
  const candidates = places.filter((q) => !lue || !q.ligne.orientation || q.ligne.orientation === lue);
  const autres = candidates.filter((q) => !interchangeables(q, place));
  if (autres.length === 0) return null;
  const designee = memeCote(page, place) || (!!lue && place.ligne.orientation === lue);
  if (designee && autres.every((q) => q.cote && !memeCote(page, q))) return null;
  // Les autres lignes possibles (même cote ou sans cote), sinon la plus proche.
  const possibles = autres.filter((q) => !q.cote || memeCote(page, q));
  const plusProche = [...autres].sort((a, b) => ecartCote(page, a) - ecartCote(page, b)).slice(0, 1);
  const alternatives = [...new Set((possibles.length ? possibles : plusProche).map(decrire))]
    .slice(0, 2)
    .join(" ou ");
  const indice = lue ? `marquée ${lue}` : "sans orientation écrite en marge";
  return `Page ${numero} (${indice}) : rien ne prouve qu'il s'agit de ${decrire(place)} plutôt que de ${alternatives}. À vérifier.`;
}

// Rang de chaque page dans la pose, lu en marge : « 2/3 » sur toutes les pages, ou à défaut
// GAUCHE/CENTRE/DROIT, chacun une fois. Sans rangs, la raison du doute.
function rangsLus(pages) {
  const n = pages.length;
  const marques = pages.map((p) => p.marque || {});
  const suite = (rangs) => [...rangs].sort((a, b) => a - b).every((r, i) => r === i + 1);
  if (marques.every((m) => m.rang)) {
    const rangs = marques.map((m) => m.rang);
    if (!marques.every((m) => m.total === n) || !suite(rangs)) {
      return { raison: `rangs ${marques.map((m) => `${m.rang}/${m.total}`).join(", ")} pour ${n} pages` };
    }
    // GAUCHE avant CENTRE avant DROIT dans l'ordre des rangs
    const ordres = marques
      .map((m, i) => ({ o: m.orientation, r: rangs[i] }))
      .sort((a, b) => a.r - b.r)
      .filter((x) => x.o)
      .map((x) => ORDRE_ORIENTATION[x.o]);
    if (ordres.some((o, i) => i > 0 && o < ordres[i - 1])) return { raison: "rangs et orientations contradictoires" };
    return { rangs };
  }
  if (marques.every((m) => m.orientation) && !marques.some((m) => m.rang)) {
    const ordres = marques.map((m) => ORDRE_ORIENTATION[m.orientation]);
    if (new Set(ordres).size !== n) return { raison: "orientations répétées sans rang (« 1/3 »)" };
    return { rangs: ordres.map((o) => ordres.filter((x) => x < o).length + 1) };
  }
  return { raison: "ni rang (« 1/3 ») ni orientation écrits en marge de chaque page" };
}

// Ordre de pose : celui des repères, sinon celui des pages, à confirmer page par page.
function doutesOrdre(pages) {
  if (pages.length < 2) return { rangs: null, doutes: pages.map(() => null) };
  const { rangs = null, raison } = rangsLus(pages);
  const doutes = pages.map((page, i) => {
    const lu = page.marque?.texte ? ` (« ${page.marque.texte} »)` : "";
    if (!rangs) return `Page ${i + 1}${lu} : ${raison}. L'ordre des pages du PDF fera l'ordre de pose : à vérifier.`;
    return rangs[i] === i + 1
      ? null
      : `Page ${i + 1}${lu} : ce sera le panneau ${rangs[i]} de la pose, pas le ${i + 1}. À vérifier.`;
  });
  return { rangs, doutes };
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

// Plusieurs PDF : le QR ne garde que 24 caractères, et « 169847 LM VALENCIENNES BOIS… » et
// « 169847 LM VALENCIENNES BETON… » en donneraient deux identiques. Chaque panneau prend son rang
// dans la commande (« 169847-2 LM … ») ; l'imposition accepte ce nom (nomDuPanneau).
const numeroterPanneaux = (panneaux) =>
  panneaux.map((p, i) => (p.nom ? { ...p, nom: sansRang(p.nom).replace(" ", `-${i + 1} `) } : p));

// « …MAT_2ex.pdf » : chaque page du PDF est à imprimer 2 fois. Sans mention, 1.
const exemplairesDuNom = (nomPdf) => Number(String(nomPdf || "").match(/(?:^|[\s_(-])(\d+)\s*ex\b/i)?.[1]) || 1;

// Une page en N exemplaires couvre jusqu'à N lignes Gamesys de même cote exacte (169922 : deux lignes
// CAPPUCCINO 90 x 210 pour « CAPPUCCINO 90x210+BLANC MAT_2ex », une page). Chaque ligne reçoit son
// panneau, placé juste après celui de la page : sa Deco, son étiquette et son nom numéroté.
function dupliquerExemplaires(panneaux, lignes, nomPdf, vernisPdf) {
  const exemplaires = exemplairesDuNom(nomPdf);
  if (exemplaires < 2) return panneaux;
  const libres = lignes.filter((l) => !panneaux.some((p) => p.ligneId === l.id));
  return panneaux.flatMap((panneau) => {
    if (panneau.erreur || !panneau.ligneId) return [panneau];
    const copies = [panneau];
    let imprimes = Number(panneau.ex) || 1;
    for (const ligne of [...libres]) {
      const ex = Number(ligne.ex) || 1;
      const cote = extraireCotes(ligne.refClient).find((c) => memeCote(panneau, { cote: c }));
      if (!cote || imprimes + ex > exemplaires) continue;
      libres.splice(libres.indexOf(ligne), 1);
      imprimes += ex;
      copies.push({
        ...panneau,
        ligneId: ligne.id,
        ex,
        vernis: vernisPdf || ligne.finishHint || null,
        ecarts: [
          ...ecartsDuPanneau(panneau, { ligne, cote }, vernisPdf),
          ...panneau.ecarts.filter((e) => e.type === "ordre"),
        ],
      });
    }
    return copies;
  });
}

// pages : [{ page, nom, largeur, hauteur, echelle, marque } | { page, erreur }], dans l'ordre du PDF.
// lignes : lignes Gamesys sur-mesure de la commande (visualJobs).
// Panneaux rendus dans l'ordre de pose (rangs lus en marge), `page` restant la page du PDF.
function apparierPanneaux(pages, lignes, nomPdf) {
  const places = placesGamesys(lignes, pages.length);
  const vernisPdf = vernisDuNom(nomPdf);

  const attribuees = attribuerPlaces(pages, places);
  const ordre = doutesOrdre(pages);

  const lues = pages.map((page, i) => {
    const place = attribuees[i];
    const doutes = [doutePlace(page, place, places), ordre.doutes[i]].filter(Boolean);
    const rang = ordre.rangs?.[i] || i + 1;
    // Le rang lu en marge numérote le panneau (nom, QR, étiquette), pas la position de la page.
    const nom = page.nom && rang !== i + 1 ? sansRang(page.nom).replace(" ", `-${rang} `) : page.nom;
    return {
      rang,
      panneau: {
        ...page,
        nom,
        ligneId: place?.ligne.id || null,
        ex: place?.ex ?? 1,
        vernis: vernisPdf || place?.ligne.finishHint || null,
        ecarts: [
          ...ecartsDuPanneau(page, place, vernisPdf),
          ...doutes.map((message) => ({ type: "ordre", page: page.page, message, bloquant: false })),
        ],
      },
    };
  });
  const parPage = lues.sort((a, b) => a.rang - b.rang).map((l) => l.panneau);
  const dupliques = dupliquerExemplaires(parPage, lignes, nomPdf, vernisPdf);
  // Deux panneaux d'une même page auraient le même nom, donc le même QR : numérotés dans le PDF.
  const panneaux = dupliques.length > parPage.length ? numeroterPanneaux(dupliques) : dupliques;

  const ecarts = [];
  if (places.length !== panneaux.length) {
    ecarts.push({
      type: "nombre",
      page: null,
      message: `${panneaux.length} panneau(x) dans le PDF, ${places.length} dans Gamesys.`,
      bloquant: false,
    });
  }
  const codes = panneaux.filter((p) => p.nom).map((p) => texteQr(p.nom));
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
