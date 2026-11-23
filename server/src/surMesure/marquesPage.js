// Repère écrit par les créa en marge de chaque page d'un PDF sur-mesure, hors format fini :
// « GAUCHE 1/3 », « HAUT-DROIT », « HAUT 2/4 ». Il dit quel panneau est sur la page, ce que
// l'ordre des pages ne garantit pas (169824 : la page 1 est marquée « HAUT 2/2 »).
// Lu dans le flux de la page avec pdf-lib, sans recharger le PDF : un texte illisible (police
// sans table Unicode, texte vectorisé) donne une page sans repère, donc un ordre à confirmer.
const { PDFArray, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } = require("pdf-lib");

const PROFONDEUR_MAX = 4;
const ESPACE_TJ = -200; // décalage TJ (millièmes de corps) au-delà duquel on compte une espace

const flux = (stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");

// Table « code -> texte » d'une police (ToUnicode) : bfchar et bfrange.
function lireToUnicode(cmap) {
  const table = new Map();
  const hex = (h) => parseInt(h, 16);
  const texte = (h) => {
    const codes = h.match(/.{1,4}/g) || [];
    return String.fromCharCode(...codes.map(hex));
  };
  for (const bloc of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, cible] of bloc[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      table.set(hex(code), texte(cible));
    }
  }
  for (const bloc of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, debut, fin, reste] of bloc[1].matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g,
    )) {
      const cibles = reste.startsWith("[") ? [...reste.matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1]) : null;
      for (let code = hex(debut), k = 0; code <= hex(fin); code++, k++) {
        if (cibles) table.set(code, texte(cibles[k] || ""));
        else table.set(code, String.fromCharCode(hex(reste.slice(1, -1)) + k));
      }
    }
  }
  return table;
}

// Décodeur d'une police : codes sur 2 octets pour une police composite (Type0), 1 sinon. Sans
// ToUnicode, seule une police simple se lit telle quelle (WinAnsi : lettres et chiffres en ASCII).
function decodeur(police) {
  if (!police) return null;
  const composite = String(police.get(PDFName.of("Subtype"))) === "/Type0";
  const toUnicode = police.lookupMaybe(PDFName.of("ToUnicode"), PDFRawStream);
  const table = toUnicode ? lireToUnicode(flux(toUnicode)) : null;
  if (!table && composite) return null;
  return (octets) => {
    let sortie = "";
    for (let i = 0; i < octets.length; i += composite ? 2 : 1) {
      const code = composite ? (octets[i] << 8) | octets[i + 1] : octets[i];
      sortie += table ? (table.get(code) ?? "") : String.fromCharCode(code);
    }
    return sortie;
  };
}

const ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };

// Jetons d'un flux de contenu : chaînes (octets), nombres, noms, tableaux et opérateurs.
function* jetons(src) {
  const delimiteur = (c) => /[\s()<>[\]{}/%]/.test(c);
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (c === "%") while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i++;
    else if (c === "(") {
      const octets = [];
      let niveau = 1;
      i++;
      while (i < src.length && niveau > 0) {
        const d = src[i++];
        if (d === "\\") {
          const e = src[i++];
          if (/[0-7]/.test(e)) {
            let oct = e;
            while (oct.length < 3 && /[0-7]/.test(src[i])) oct += src[i++];
            octets.push(parseInt(oct, 8) & 0xff);
          } else if (e === "\r" || e === "\n") {
            if (e === "\r" && src[i] === "\n") i++;
          } else octets.push((ESCAPES[e] ?? e).charCodeAt(0));
        } else {
          if (d === "(") niveau++;
          if (d === ")" && --niveau === 0) break;
          octets.push(d.charCodeAt(0));
        }
      }
      yield { chaine: octets };
    } else if (c === "<" && src[i + 1] === "<") {
      i += 2;
      yield { op: "<<" };
    } else if (c === ">" && src[i + 1] === ">") {
      i += 2;
      yield { op: ">>" };
    } else if (c === "<") {
      const fin = src.indexOf(">", i);
      const h = src.slice(i + 1, fin < 0 ? src.length : fin).replace(/\s/g, "");
      i = fin < 0 ? src.length : fin + 1;
      yield { chaine: (h.length % 2 ? `${h}0` : h).match(/../g)?.map((x) => parseInt(x, 16)) || [] };
    } else if (c === "[" || c === "]" || c === "{" || c === "}") {
      i++;
      yield { op: c };
    } else if (c === "/") {
      let j = i + 1;
      while (j < src.length && !delimiteur(src[j])) j++;
      yield { nom: src.slice(i, j) };
      i = j;
    } else {
      let j = i;
      while (j < src.length && !delimiteur(src[j])) j++;
      if (j === i) j++;
      const mot = src.slice(i, j);
      i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(mot)) yield { nombre: Number(mot) };
      else if (mot === "ID") {
        // image en ligne : données binaires jusqu'à « EI »
        const fin = src.slice(i).search(/\sEI(?=[\s]|$)/);
        i = fin < 0 ? src.length : i + fin + 3;
      } else yield { op: mot };
    }
  }
}

const multiplier = ([a, b, c, d, e, f], [A, B, C, D, E, F]) => [
  a * A + b * C,
  a * B + b * D,
  c * A + d * C,
  c * B + d * D,
  e * A + f * C + E,
  e * B + f * D + F,
];
const IDENTITE = [1, 0, 0, 1, 0, 0];

// Texte d'un flux visible dans la page : Illustrator laisse dans chaque page le texte des plans de
// travail voisins, rogné mais présent (page 2 de 169580 : « GAUCHE 1/3 » de la page 1). Seul compte
// le texte dont le point de départ tombe dans la MediaBox. Les Form XObject (pas les images) sont
// parcourus.
function texteDuFlux(source, ressources, ctmInitiale, boite, profondeur, morceaux) {
  const polices = ressources?.lookupMaybe(PDFName.of("Font"), PDFDict);
  const xobjets = ressources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  const decodeurs = new Map();
  let decode = null;
  let ctm = ctmInitiale;
  const pileCtm = [];
  let tm = IDENTITE;
  let lm = IDENTITE;
  let interligne = 0;
  let pile = [];
  let tableau = null;
  const nombres = () => pile.map((x) => x.nombre);
  const aLaLigne = (tx, ty) => {
    lm = multiplier([1, 0, 0, 1, tx, ty], lm);
    tm = lm;
  };
  const visible = () => {
    const [, , , , x, y] = multiplier(tm, ctm);
    // Strict : le repère d'une page voisine commence juste après le bord (169760 : 1 pt).
    return x >= boite.x && x < boite.x + boite.width && y >= boite.y && y < boite.y + boite.height;
  };
  const montrer = (chaines) => {
    if (decode && visible()) {
      for (const x of chaines) {
        if (x.chaine) morceaux.push(decode(x.chaine));
        else if (x.nombre < ESPACE_TJ) morceaux.push(" ");
      }
    }
    morceaux.push(" ");
  };
  for (const j of jetons(source)) {
    if (j.op === "[") tableau = [];
    else if (j.op === "]") {
      pile.push({ tableau });
      tableau = null;
    } else if (tableau && !j.op) tableau.push(j);
    else if (!j.op) pile.push(j);
    else {
      const op = j.op;
      if (op === "q") pileCtm.push(ctm);
      else if (op === "Q") ctm = pileCtm.pop() || ctm;
      else if (op === "cm" && pile.length === 6) ctm = multiplier(nombres(), ctm);
      else if (op === "BT") tm = lm = IDENTITE;
      else if (op === "Tm" && pile.length === 6) tm = lm = nombres();
      else if (op === "Td" && pile.length === 2) aLaLigne(...nombres());
      else if (op === "TD" && pile.length === 2) {
        interligne = -pile[1].nombre;
        aLaLigne(...nombres());
      } else if (op === "TL" && pile.length === 1) interligne = pile[0].nombre;
      else if (op === "T*") aLaLigne(0, -interligne);
      else if (op === "Tf" && pile[0]?.nom) {
        const nom = pile[0].nom.slice(1);
        if (!decodeurs.has(nom)) decodeurs.set(nom, decodeur(polices?.lookupMaybe(PDFName.of(nom), PDFDict)));
        decode = decodeurs.get(nom);
      } else if (op === "Tj" || op === "'" || op === '"') {
        if (op !== "Tj") aLaLigne(0, -interligne);
        const s = pile.findLast((x) => x.chaine);
        montrer(s ? [s] : []);
      } else if (op === "TJ") montrer(pile.at(-1)?.tableau || []);
      else if (op === "ET") morceaux.push(" ");
      else if (op === "Do" && pile[0]?.nom && profondeur < PROFONDEUR_MAX) {
        const forme = xobjets?.lookupMaybe(PDFName.of(pile[0].nom.slice(1)), PDFRawStream);
        if (String(forme?.dict.get(PDFName.of("Subtype"))) === "/Form") {
          const res = forme.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) || ressources;
          const matrice = forme.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
          const m = matrice ? matrice.asArray().map((n) => n.asNumber()) : IDENTITE;
          texteDuFlux(flux(forme), res, multiplier(m, ctm), boite, profondeur + 1, morceaux);
        }
      }
      pile = [];
    }
  }
}

// Texte visible d'une page, mots séparés par des espaces.
function texteDePage(doc, index) {
  const page = doc.getPages()[index];
  const contenu = page.node.Contents();
  const flots =
    contenu instanceof PDFArray ? contenu.asArray().map((r) => doc.context.lookup(r)) : contenu ? [contenu] : [];
  const morceaux = [];
  const source = flots.map(flux).join("\n");
  texteDuFlux(source, page.node.Resources(), IDENTITE, page.getMediaBox(), 0, morceaux);
  return morceaux.join("").replace(/\s+/g, " ").trim();
}

const ORIENTATIONS = { GAUCHE: "GAUCHE", CENTRE: "CENTRE", DROIT: "DROIT", DROITE: "DROIT" };

// « GAUCHE 1/3 » -> { orientation: "GAUCHE", rang: 1, total: 3 }. Deux orientations différentes sur
// une page ne disent rien : orientation null.
function lireMarque(texte) {
  const mots = String(texte || "").toUpperCase();
  const orientations = new Set(
    [...mots.matchAll(/(?<![A-Z])(GAUCHE|CENTRE|DROITE?)(?![A-Z])/g)].map((m) => ORIENTATIONS[m[1]]),
  );
  const rangs = [...mots.matchAll(/(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/g)];
  const [, rang, total] = rangs.length === 1 ? rangs[0] : [];
  return {
    texte: String(texte || "").slice(0, 80),
    orientation: orientations.size === 1 ? [...orientations][0] : null,
    rang: rang ? Number(rang) : null,
    total: total ? Number(total) : null,
  };
}

// Repère d'une page, ou repère vide si le texte ne se lit pas : l'ordre sera alors à confirmer.
function marqueDePage(doc, index) {
  try {
    return lireMarque(texteDePage(doc, index));
  } catch {
    return lireMarque("");
  }
}

module.exports = { lireMarque, marqueDePage, texteDePage };
