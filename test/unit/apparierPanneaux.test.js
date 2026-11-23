const { expect } = require("chai");
const {
  apparierPanneaux,
  complementPdf,
  ecartsGlobaux,
  lignesRestantes,
  numeroterPanneaux,
  extraireCotes,
  plaqueMm,
  vernisDuNom,
} = require("../../server/src/surMesure/apparierPanneaux");
const { lireMarque } = require("../../server/src/surMesure/marquesPage");

const pages = (nom, ...tailles) =>
  tailles.map(([largeur, hauteur], page) => ({ page, nom: `${nom}-${page + 1}`, largeur, hauteur, echelle: 1 }));

// Repères écrits par les créa en marge de chaque page, relevés dans les PDF réels.
const marquer = (liste, ...textes) => liste.map((p, i) => ({ ...p, marque: lireMarque(textes[i] || "") }));

const ligne = (id, refClient, orientation, extra = {}) => ({
  id,
  refClient,
  orientation,
  ex: 1,
  formatTauro: "101x215",
  matiere: "Dibond 1F - Blanc - Deco - FOURNISS",
  ...extra,
});

const types = (panneau) => panneau.ecarts.map((e) => e.type);

describe("surMesure/apparierPanneaux — commandes réelles de novembre 2026", () => {
  it("169548 : signale la largeur de 80 cm face aux 100 cm de Gamesys", () => {
    const nom = "169548 LM LE MANS Onyx 100x210cm(3)BRILLANT";
    const { panneaux, ecarts } = apparierPanneaux(
      marquer(pages("169548", [800, 2100], [1000, 2100], [1000, 2100]), "GAUCHE 1/3", "CENTRE 2/3", "DROIT 3/3"),
      [
        ligne("/04", "ONYX DROIT 100 x 210", "DROIT"),
        ligne("/05", "ONYX CENTRE 100 x 210", "CENTRE"),
        ligne("/06", "ONYX GAUCHE 100 x 210", "GAUCHE"),
      ],
      nom,
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/06", "/05", "/04"]);
    expect(types(panneaux[0])).to.deep.equal(["dimensions"]);
    expect(panneaux[0].ecarts[0].bloquant).to.equal(false);
    expect(types(panneaux[1])).to.deep.equal([]);
    expect(ecarts).to.deep.equal([]);
  });

  it("169580 : conforme, malgré des sous-dossiers dans le désordre", () => {
    const { panneaux, ecarts } = apparierPanneaux(
      marquer(pages("169580", [800, 2100], [700, 2100], [700, 2100]), "GAUCHE 1/3", "CENTRE 2/3", "DROIT 3/3"),
      [
        ligne("/02", "JARDIN SECRET GAUCHE 80 x 210 MAT", "GAUCHE", { finishHint: "MAT" }),
        ligne("/04", "JARDIN SECRET CENTRE 70 x 210 MAT", "CENTRE", { finishHint: "MAT" }),
        ligne("/03", "JARDIN SECRET DROIT 70 x 210 MAT", "DROIT", { finishHint: "MAT" }),
      ],
      "169580 LM AMIENS JardinSecret H210cm(3)MAT",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/02", "/04", "/03"]);
    expect(panneaux.flatMap(types)).to.deep.equal([]);
    expect(ecarts).to.deep.equal([]);
  });

  it("169603 : conforme", () => {
    const opts = { finishHint: "BRILLANT", formatTauro: "126x260" };
    const { panneaux } = apparierPanneaux(
      marquer(pages("169603", [1000, 2550], [1000, 2550], [1000, 2550]), "GAUCHE 1/3", "CENTRE 2/3", "DROIT 3/3"),
      [
        ligne("/03", "VERRE SOUFFLE DROIT 100 x 255 BRILLANT", "DROIT", opts),
        ligne("/04", "VERRE SOUFFLE CENTRE 100 x 255 BRILLANT", "CENTRE", opts),
        ligne("/05", "VERRE SOUFFLE GAUCHE 100 x 255 BRILLANT", "GAUCHE", opts),
      ],
      "169603 LM VOURLES VerreSouffle 100x255cm(3)BRILLANT",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/05", "/04", "/03"]);
    expect(panneaux.flatMap(types)).to.deep.equal([]);
  });

  it("169669 : une seule ligne sur-mesure, conforme", () => {
    const { panneaux, ecarts } = apparierPanneaux(
      pages("169669", [1000, 2550]),
      [ligne("/08", "PALMERAI DROIT  MIRROIR 100 x 255 MAT", "DROIT", { finishHint: "MAT", formatTauro: "126x260" })],
      "169669 LM ST BRIEUC PALMERAIE 100x255 DROIT miroir MAT",
    );
    expect(panneaux[0].ligneId).to.equal("/08");
    expect(types(panneaux[0])).to.deep.equal([]);
    expect(ecarts).to.deep.equal([]);
  });

  it("169694 : deux panneaux sur une ligne, faute de frappe signalée", () => {
    const { panneaux, ecarts } = apparierPanneaux(
      marquer(pages("169694", [700, 1800], [800, 1800]), "HAUT 1/2", "HAUT 2/2"),
      [ligne("/01", "GRAVURE NATURE 70 x 80 + 80 x 180 MAT", null, { finishHint: "MAT" })],
      "169694 ECOM MONROCQ_Gavure nature_70x180+80x180cm_MAT(2)",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/01", "/01"]);
    expect(types(panneaux[0])).to.deep.equal(["dimensions"]);
    expect(types(panneaux[1])).to.deep.equal([]);
    expect(ecarts).to.deep.equal([]);
  });

  it("169063 : sans orientation, relie chaque page à sa ligne par la cote", () => {
    const plaque = { formatTauro: "101x215", finishHint: "BRILLANT" };
    const { panneaux, ecarts } = apparierPanneaux(
      marquer(
        pages("169063", [1000, 2100], [882, 2100], [769, 2100], [769, 2100], [882, 2100]),
        "GAUCHE 1/5",
        "GAUCHE 2/5",
        "CENTRE 3/5",
        "CENTRE 4/5",
        "DROIT 5/5",
      ),
      [
        ligne("/08", "MARBRE NERF 88.2 x 210 BRILLANT", null, plaque),
        ligne("/07", "MARBRE NERF 76.9 x 210 BRILLANT", null, plaque),
        ligne("/06", "MARBRE NERF 88.2 x 210 BRILLANT", null, plaque),
        ligne("/05", "MARBRE NERF 100 x 231 BRILLANT", null, { ...plaque, formatTauro: "126x260" }),
        ligne("/04", "MARBRE NERF 76.9 x 210 BRILLANT", null, plaque),
      ],
      "169063 LM STE GENEVIEVE MarbreNerf H210cm(5)BRILLANT",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/05", "/08", "/07", "/04", "/06"]);
    // 100 x 231 dans Gamesys : aucune ligne n'a la cote de la page 1, sa place est donc aussi à confirmer
    expect(types(panneaux[0])).to.deep.equal(["dimensions", "ordre"]);
    expect(panneaux.slice(1).flatMap(types)).to.deep.equal([]);
    expect(ecarts).to.deep.equal([]);
  });

  it("168917 sans orientation écrite : deux lignes GAUCHE et deux DROIT, chaque page prend la ligne de sa cote", () => {
    const plaque = (f) => ({ formatTauro: f });
    const { panneaux, ecarts } = apparierPanneaux(
      marquer(pages("168917", [1488, 2400], [1491, 2400], [1000, 2400], [1000, 2400]), "1/4", "2/4", "3/4", "4/4"),
      [
        ligne("/05", "ONYX GAUCHE 148.80 x 240 MAT", "GAUCHE", plaque("151x260")),
        ligne("/04", "ONYX DROIT 100 x 240 MAT", "DROIT", plaque("126x260")),
        ligne("/03", "ONYX GAUCHE 100 x 240 MAT", "GAUCHE", plaque("126x260")),
        ligne("/02", "ONYX DROIT 149.10 x 240 MAT", "DROIT", plaque("151x260")),
      ],
      "168917 LM BEZIERS Onyx H240cm(4)MAT",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/05", "/02", "/03", "/04"]);
    // pages 3 et 4 : GAUCHE et DROIT ont la même cote, rien ne dit laquelle est laquelle
    expect(panneaux.map(types)).to.deep.equal([[], [], ["ordre"], ["ordre"]]);
    expect(panneaux[2].ecarts[0].message).to.equal(
      "Page 3 (sans orientation écrite en marge) : rien ne prouve qu'il s'agit de GAUCHE 100 x 240 cm plutôt que de DROIT 100 x 240 cm. À vérifier.",
    );
    expect(ecarts).to.deep.equal([]);
  });

  it("169211 : cotes mal saisies dans Gamesys, chaque page prend la ligne la plus proche", () => {
    const { panneaux } = apparierPanneaux(
      marquer(pages("169211", [1188, 2100], [888, 2100]), "GAUCHE 1/2", "DROIT 2/2"),
      [
        ligne("/04", "ONYX GUACHE 123.8 x 210 MAT", null, { formatTauro: "126x215" }),
        ligne("/03", "ONYX DROIT 88.8 xc 210 MAT", "DROIT"),
      ],
      "169211 LM ST BRIEUC Onyx H210cm(2)MAT_10",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/04", "/03"]);
    expect(types(panneaux[0])).to.deep.equal(["dimensions"]);
    expect(types(panneaux[1])).to.deep.equal([]);
  });

  it("168917 : les repères des créa (CENTRE, « 1/4 » deux fois) contredisent Gamesys, tout est à confirmer", () => {
    const plaque = (f) => ({ formatTauro: f });
    const { panneaux } = apparierPanneaux(
      marquer(
        pages("168917", [1488, 2400], [1491, 2400], [1000, 2400], [1000, 2400]),
        "GAUCHE 1/4",
        "CENTRE 2/4",
        "CENTRE 3/4",
        "GAUCHE 1/4",
      ),
      [
        ligne("/05", "ONYX GAUCHE 148.80 x 240 MAT", "GAUCHE", plaque("151x260")),
        ligne("/04", "ONYX DROIT 100 x 240 MAT", "DROIT", plaque("126x260")),
        ligne("/03", "ONYX GAUCHE 100 x 240 MAT", "GAUCHE", plaque("126x260")),
        ligne("/02", "ONYX DROIT 149.10 x 240 MAT", "DROIT", plaque("151x260")),
      ],
      "168917 LM BEZIERS Onyx H240cm(4)MAT",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/05", "/02", "/04", "/03"]);
    expect(panneaux.every((p) => p.ecarts.some((e) => e.type === "ordre" && !e.bloquant))).to.equal(true);
    expect(panneaux[1].ecarts.map((e) => e.message)).to.include(
      "Page 2 marquée CENTRE dans le PDF, reliée à DROIT 149,1 x 240 cm dans Gamesys. À vérifier.",
    );
    expect(panneaux[0].ecarts.map((e) => e.message)).to.include(
      "Page 1 (« GAUCHE 1/4 ») : rangs 1/4, 2/4, 3/4, 1/4 pour 4 pages. L'ordre des pages du PDF fera l'ordre de pose : à vérifier.",
    );
  });

  it("169824 : la page 1 est marquée « HAUT 2/2 » : le panneau 1 de la pose est la page 2, à confirmer", () => {
    const { panneaux } = apparierPanneaux(
      marquer(pages("169824 LM BEZIERS TRAVERTIN", [1480, 2000], [890, 2000]), "HAUT 2/2", "HAUT 1/2"),
      [
        ligne("/01", "TRAVERTIN 148 x 200 MAT", null, { formatTauro: "151x260" }),
        ligne("/02", "TRAVERTIN 89 x 200 MAT", null),
      ],
      "169824 LM BEZIERS TRAVERTIN H200cm(2)+BLANC MAT",
    );
    expect(panneaux.map((p) => [p.page, p.ligneId, p.nom])).to.deep.equal([
      [1, "/02", "169824-1 LM BEZIERS TRAVERTIN-2"],
      [0, "/01", "169824-2 LM BEZIERS TRAVERTIN-1"],
    ]);
    expect(panneaux.map((p) => p.ecarts.map((e) => e.message))).to.deep.equal([
      ["Page 2 (« HAUT 1/2 ») : ce sera le panneau 1 de la pose, pas le 2. À vérifier."],
      ["Page 1 (« HAUT 2/2 ») : ce sera le panneau 2 de la pose, pas le 1. À vérifier."],
    ]);
  });

  it("168532 (ECOM) : HAUT-GAUCHE, HAUT-CENTRE, HAUT-DROIT suffisent sans rang", () => {
    const { panneaux } = apparierPanneaux(
      marquer(pages("168532", [1405, 2500], [855, 2500], [1255, 2500]), "HAUT-GAUCHE", "HAUT-CENTRE", "HAUT-DROIT"),
      [
        ligne("/03", "TRAVERTINO DROIT 125.5 x 250", "DROIT", { formatTauro: "151x260" }),
        ligne("/01", "TRAVERTINO GAUCHE 140.5 x 250", "GAUCHE", { formatTauro: "151x260" }),
        ligne("/02", "TRAVERTINO CENTRE 85.5 x 250", "CENTRE", { formatTauro: "126x260" }),
      ],
      "168532 ECOM ESNAULT_Travertino_H250cm_MAT (3)",
    );
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/01", "/02", "/03"]);
    expect(panneaux.flatMap(types)).to.deep.equal([]);
  });

  it("l'orientation écrite sur la page passe avant l'ordre des pages", () => {
    const { panneaux } = apparierPanneaux(
      marquer(pages("1", [1000, 2100], [1000, 2100]), "DROIT", "GAUCHE"),
      [ligne("/01", "ONYX GAUCHE 100 x 210", "GAUCHE"), ligne("/02", "ONYX DROIT 100 x 210", "DROIT")],
      "1 LM X H210cm(2)MAT",
    );
    expect(panneaux.map((p) => [p.page, p.ligneId])).to.deep.equal([
      [1, "/01"],
      [0, "/02"],
    ]);
    expect(panneaux.map((p) => types(p))).to.deep.equal([["ordre"], ["ordre"]]);
  });

  describe("sans repère en marge, rien n'est sûr", () => {
    const lignes = [
      ligne("/03", "VERRE SOUFFLE DROIT 100 x 255", "DROIT", { formatTauro: "126x260" }),
      ligne("/04", "VERRE SOUFFLE CENTRE 100 x 255", "CENTRE", { formatTauro: "126x260" }),
      ligne("/05", "VERRE SOUFFLE GAUCHE 100 x 255", "GAUCHE", { formatTauro: "126x260" }),
    ];
    const sansRepere = (n) =>
      `Page ${n} : ni rang (« 1/3 ») ni orientation écrits en marge de chaque page. L'ordre des pages du PDF fera l'ordre de pose : à vérifier.`;

    it("169603 sans repères : GAUCHE, CENTRE et DROIT de même cote, chaque page à confirmer", () => {
      const { panneaux } = apparierPanneaux(pages("169603", [1000, 2550], [1000, 2550], [1000, 2550]), lignes, "x MAT");
      expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/05", "/04", "/03"]);
      expect(panneaux[0].ecarts.map((e) => e.message)).to.deep.equal([
        "Page 1 (sans orientation écrite en marge) : rien ne prouve qu'il s'agit de GAUCHE 100 x 255 cm plutôt que de CENTRE 100 x 255 cm ou DROIT 100 x 255 cm. À vérifier.",
        sansRepere(1),
      ]);
      expect(panneaux.every((p) => p.ecarts.length === 2)).to.equal(true);
    });

    it("des rangs seuls ne disent pas quelle page est GAUCHE quand les cotes sont égales", () => {
      const { panneaux } = apparierPanneaux(
        marquer(pages("1", [1000, 2550], [1000, 2550], [1000, 2550]), "1/3", "2/3", "3/3"),
        lignes,
        "x MAT",
      );
      expect(panneaux.map((p) => types(p))).to.deep.equal([["ordre"], ["ordre"], ["ordre"]]);
    });

    it("des cotes toutes différentes suffisent à relier les pages, mais pas à les ordonner", () => {
      const { panneaux } = apparierPanneaux(
        pages("1", [800, 2100], [1000, 2100]),
        [ligne("/01", "A GAUCHE 80 x 210", "GAUCHE"), ligne("/02", "A DROIT 100 x 210", "DROIT")],
        "x MAT",
      );
      expect(panneaux.map((p) => p.ecarts.map((e) => e.message))).to.deep.equal([[sansRepere(1)], [sansRepere(2)]]);
    });

    it("une page marquée DROIT reste à confirmer si une ligne sans orientation a la même cote", () => {
      const { panneaux } = apparierPanneaux(
        marquer(pages("1", [1000, 2100], [1000, 2100]), "GAUCHE 1/2", "DROIT 2/2"),
        [
          ligne("/01", "A GAUCHE 100 x 210", "GAUCHE"),
          ligne("/02", "A 100 x 210", null),
          ligne("/03", "A DROIT 100 x 210", "DROIT"),
        ],
        "x MAT",
      );
      expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/01", "/03"]);
      expect(types(panneaux[0])).to.deep.equal(["ordre"]);
      expect(types(panneaux[1])).to.deep.equal(["ordre"]);
    });
  });

  it("169532 : panneau expo sur plaque 101x215, conforme", () => {
    const { panneaux } = apparierPanneaux(
      pages("169532", [605, 2000]),
      [ligne("/03", "Panneau expo 60.5 x 200 cm - OFFERT", null)],
      "169532 BM ETALONDES ROND DE BOIS MAT+BLANC 60,5x200+BLANC MAT",
    );
    expect(types(panneaux[0])).to.deep.equal([]);
  });
});

describe("surMesure/apparierPanneaux — règles", () => {
  it("donne une page par exemplaire quand une ligne en quantité 3 couvre 3 pages", () => {
    const { panneaux, ecarts } = apparierPanneaux(
      marquer(pages("1", [1000, 2100], [1000, 2100], [1000, 2100]), "1/3", "2/3", "3/3"),
      [ligne("/01", "ONYX 100 x 210", null, { ex: 3 })],
      "1 LM X H210cm(3)MAT",
    );
    expect(panneaux.map((p) => [p.ligneId, p.ex])).to.deep.equal([
      ["/01", 1],
      ["/01", 1],
      ["/01", 1],
    ]);
    expect(panneaux.flatMap(types)).to.deep.equal([]);
    expect(ecarts).to.deep.equal([]);
  });

  it("garde la quantité sur un PDF d'une page", () => {
    const { panneaux } = apparierPanneaux(
      pages("1", [1000, 2100]),
      [ligne("/01", "ONYX 100 x 210", null, { ex: 3 })],
      "1 LM X MAT",
    );
    expect(panneaux[0].ex).to.equal(3);
  });

  it("signale un nombre de panneaux différent et une page sans ligne", () => {
    const { panneaux, ecarts } = apparierPanneaux(
      marquer(pages("1", [1000, 2100], [1000, 2100]), "1/2", "2/2"),
      [ligne("/01", "ONYX 100 x 210", null)],
      "1 LM X MAT",
    );
    expect(ecarts.map((e) => e.type)).to.deep.equal(["nombre"]);
    expect(types(panneaux[1])).to.deep.equal(["nombre"]);
  });

  it("signale un vernis contradictoire", () => {
    const { panneaux } = apparierPanneaux(
      pages("1", [1000, 2100]),
      [ligne("/01", "ONYX 100 x 210 BRILLANT", null, { finishHint: "BRILLANT" })],
      "1 LM X MAT",
    );
    expect(types(panneaux[0])).to.deep.equal(["vernis"]);
    expect(panneaux[0].vernis).to.equal("MAT");
  });

  it("bloque un panneau trop grand pour la plaque", () => {
    const { panneaux } = apparierPanneaux(
      pages("1", [1200, 2100]),
      [ligne("/01", "ONYX 120 x 210", null)],
      "1 LM X MAT",
    );
    expect(panneaux[0].ecarts).to.have.length(1);
    expect(panneaux[0].ecarts[0]).to.include({ type: "plaque", bloquant: true });
  });

  it("bloque une matière autre que Dibond", () => {
    const { panneaux } = apparierPanneaux(
      pages("1", [1000, 2100]),
      [ligne("/01", "ONYX 100 x 210", null, { matiere: "PVC 5mm" })],
      "1 LM X MAT",
    );
    expect(panneaux[0].ecarts[0]).to.include({ type: "matiere", bloquant: true });
  });

  it("bloque un panneau plus large que haut et une page sans échelle", () => {
    const { panneaux } = apparierPanneaux(
      [{ page: 0, nom: "a", largeur: 2030, hauteur: 600, echelle: 1 }, { page: 1, erreur: "échelle à préciser" }],
      [ligne("/01", "A", null), ligne("/02", "B", null)],
      "1 LM X MAT",
    );
    expect(panneaux[0].ecarts.some((e) => e.type === "sens" && e.bloquant)).to.equal(true);
    expect(panneaux[1].ecarts[0]).to.include({ type: "echelle", bloquant: true });
  });

  it("bloque deux plaques au même QR", () => {
    const nom = "169000 LM SAINT GERMAIN EN LAYE A";
    const { ecarts } = apparierPanneaux(
      [
        { page: 0, nom, largeur: 1000, hauteur: 2100, echelle: 1 },
        { page: 1, nom, largeur: 1000, hauteur: 2100, echelle: 1 },
      ],
      [ligne("/01", "A", "GAUCHE"), ligne("/02", "B", "DROIT")],
      "x MAT",
    );
    expect(ecarts[0]).to.include({ type: "qr", bloquant: true });
  });

  it("lit les cotes, la plaque et le vernis", () => {
    expect(extraireCotes("ARCHE BEIGE CENTRE 86.9 X 201.5 MAT")).to.deep.equal([{ largeur: 869, hauteur: 2015 }]);
    expect(extraireCotes("70 x 80 + 80 x 180")).to.have.length(2);
    expect(extraireCotes("")).to.deep.equal([]);
    expect(plaqueMm("101x215")).to.deep.equal([2150, 1010]);
    expect(plaqueMm("Deco_Std_126x260")).to.deep.equal([2600, 1260]);
    expect(plaqueMm("")).to.equal(null);
    expect(vernisDuNom("169011 LM VALENCIENNES Gaia L85xH195cm(2)+BLANC MAT")).to.equal("MAT");
    expect(vernisDuNom("169548 LM LE MANS Onyx 100x210cm(3)BRILLANT")).to.equal("BRILLANT");
    expect(vernisDuNom("169000 LM X")).to.equal(null);
  });
});

describe("surMesure/apparierPanneaux — commandes à plusieurs PDF", () => {
  const bois = ligne("/01", "BOIS VARIE 150 x 255", undefined, { formatTauro: "151x260" });
  const beton = ligne("/00", "BETON CLAIR 120 x 240", undefined, { formatTauro: "126x260" });

  it("169847 : le PDF BETON CLAIR complète la ligne restée sans panneau", () => {
    const principal = apparierPanneaux(pages("169847 BOIS", [1500, 2550]), [bois, beton], "169847 BOIS VARIE MAT");
    const restantes = lignesRestantes(principal.panneaux, [bois, beton]);
    expect(restantes.map((l) => l.id)).to.deep.equal(["/00"]);

    const ajout = complementPdf(pages("169847 BETON", [1200, 2400]), restantes, "169847 BETON CLAIR 120x240 MAT");
    expect(ajout.map((p) => [p.ligneId, p.vernis])).to.deep.equal([["/00", "MAT"]]);

    const tous = [...principal.panneaux, ...ajout];
    expect(lignesRestantes(tous, [bois, beton])).to.deep.equal([]);
    expect(ecartsGlobaux(tous, [bois, beton])).to.deep.equal([]);
  });

  it("refuse un PDF dont une page n'a pas exactement la cote d'une ligne restante (ancienne version, autre visuel)", () => {
    expect(complementPdf(pages("x", [1500, 2550]), [beton], "169847 BOIS VARIE MAT")).to.equal(null);
    expect(complementPdf(pages("x", [1200, 2400], [1200, 2400]), [beton], "169847 BETON MAT")).to.equal(null);
  });

  it("refuse une ligne sans cote : rien ne prouve que le PDF lui appartient", () => {
    const sansCote = ligne("/02", "BETON CLAIR SUR MESURE");
    expect(complementPdf(pages("x", [1200, 2400]), [sansCote], "169847 BETON MAT")).to.equal(null);
  });

  it("refuse une page illisible", () => {
    expect(complementPdf([{ page: 0, erreur: "échelle à préciser" }], [beton], "x")).to.equal(null);
  });

  describe("169922 : une page « _2ex » pour deux lignes Gamesys de même cote", () => {
    const cappu = [ligne("/02", "CAPPUCCINNO CLAIR 90 x 210 MAT"), ligne("/00", "CAPPUCCINO CLAIR 90 x 210 MAT")];
    const carreaux = ligne("/01", "CARREAUX DE CIMENT NOIR 119 x 210 MAT", undefined, { formatTauro: "126x260" });
    const lignes = [...cappu, carreaux];
    const principal = () =>
      apparierPanneaux(pages("169922 CARREAUX", [1190, 2100]), lignes, "169922 CARREAUX MAT");

    it("la page couvre les deux lignes : un panneau par ligne, chacun avec son nom", () => {
      const ajout = complementPdf(
        pages("169922 LM LONGUEAU CAPPUCCINO 90x210+BLANC MAT_2ex", [900, 2100]),
        lignesRestantes(principal().panneaux, lignes),
        "169922 LM LONGUEAU CAPPUCCINO 90x210+BLANC MAT_2ex",
      );
      const tous = numeroterPanneaux([...principal().panneaux, ...ajout]);
      expect(tous.map((p) => [p.ligneId, p.page, p.ex, p.largeur])).to.deep.equal([
        ["/01", 0, 1, 1190],
        ["/02", 0, 1, 900],
        ["/00", 0, 1, 900],
      ]);
      expect(tous.map((p) => p.ecarts)).to.deep.equal([[], [], []]);
      expect(lignesRestantes(tous, lignes)).to.deep.equal([]);
      expect(ecartsGlobaux(tous, lignes)).to.deep.equal([]);
      expect(new Set(tous.map((p) => p.nom)).size).to.equal(3);
    });

    it("sans « Nex » dans le nom, la seconde ligne reste signalée", () => {
      const ajout = complementPdf(
        pages("169922 CAPPU", [900, 2100]),
        lignesRestantes(principal().panneaux, lignes),
        "169922 CAPPUCCINO 90x210+BLANC MAT",
      );
      const tous = [...principal().panneaux, ...ajout];
      expect(tous.map((p) => p.ligneId)).to.deep.equal(["/01", "/02"]);
      expect(ecartsGlobaux(tous, lignes).map((e) => e.message)).to.deep.equal([
        "2 panneau(x) dans les PDF, 3 dans Gamesys.",
      ]);
    });
  });

  it("une page « _2ex » ne couvre pas une 3e ligne, ni une ligne d'une autre cote", () => {
    const lignes = [
      ligne("/00", "X 90 x 210"),
      ligne("/01", "X 90 x 210"),
      ligne("/02", "X 90 x 210"),
      ligne("/03", "X 80 x 210"),
    ];
    const { panneaux, ecarts } = apparierPanneaux(pages("169000 LM X MAT_2ex", [900, 2100]), lignes, "169000 LM X MAT_2ex");
    expect(panneaux.map((p) => p.ligneId)).to.deep.equal(["/00", "/01"]);
    expect(panneaux.map((p) => p.nom)).to.deep.equal(["169000-1 LM X MAT_2ex-1", "169000-2 LM X MAT_2ex-1"]);
    expect(ecarts.map((e) => e.type)).to.deep.equal(["nombre"]);
  });

  it("une ligne en 2 ex sur un PDF « _2ex » d'une page garde un seul panneau en 2 ex", () => {
    const { panneaux, ecarts } = apparierPanneaux(
      pages("169000 LM X MAT_2ex", [900, 2100]),
      [ligne("/00", "X 90 x 210", undefined, { ex: 2 })],
      "169000 LM X MAT_2ex",
    );
    expect(panneaux.map((p) => [p.ligneId, p.ex])).to.deep.equal([["/00", 2]]);
    expect(ecarts).to.deep.equal([]);
  });

  it("signale deux plaques au même QR entre deux PDF", () => {
    const p = (ligneId) => ({ page: 0, nom: "169000 LM X MAT", largeur: 1000, hauteur: 2100, ligneId, ecarts: [] });
    const lignes = [ligne("/00", "X 100 x 210"), ligne("/01", "X 100 x 210")];
    expect(ecartsGlobaux([p("/00"), p("/01")], lignes).map((e) => e.type)).to.deep.equal(["qr"]);
  });
});

describe("surMesure/apparierPanneaux — numérotation dans la commande", () => {
  it("169847 : numérote les panneaux de plusieurs PDF, sinon les deux QR seraient identiques", () => {
    const noms = numeroterPanneaux([
      { page: 0, nom: "169847 LM VALENCIENNES BOIS VARIE 150x255 MAT" },
      { page: 0, nom: "169847 LM VALENCIENNES BETON CLAIR 120x240 MAT" },
    ]).map((p) => p.nom);
    expect(noms).to.deep.equal([
      "169847-1 LM VALENCIENNES BOIS VARIE 150x255 MAT",
      "169847-2 LM VALENCIENNES BETON CLAIR 120x240 MAT",
    ]);
    expect(ecartsGlobaux(noms.map((nom, i) => ({ nom, ligneId: String(i) })), [ligne("0", "A"), ligne("1", "B")])).to.deep.equal([]);
  });

  it("remplace le rang d'un PDF de plusieurs pages et laisse une page illisible sans nom", () => {
    const noms = numeroterPanneaux([
      { page: 0, nom: "169000-1 LM X MAT" },
      { page: 1, erreur: "échelle" },
      { page: 0, nom: "169000 LM Y MAT" },
    ]).map((p) => p.nom);
    expect(noms).to.deep.equal(["169000-1 LM X MAT", undefined, "169000-3 LM Y MAT"]);
  });
});
