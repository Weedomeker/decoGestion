const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { PDFDocument, PDFName, PDFRawStream, rgb } = require("pdf-lib");
const { rectanglesBandes, NOIR, PRESQUE_NOIR, BLEU } = require("../../server/src/utils/bandesEncrage");
const modifyPdf = require("../../server/src/app");
const amalgameCredences = require("../../server/src/amalgameCredences").modifyPdf;

const MM = 72 / 25.4;

// Plaque et panneau (fond perdu compris) en mm, panneau centré, repères comme app.js. Résultat en mm.
function bandes([plaqueL, plaqueH], [l, h], { nomHaut, reperes } = {}) {
  const x0 = (plaqueL - l) / 2;
  const y0 = (plaqueH - h) / 2;
  const r = reperes || {
    haut: [x0 + 13, x0 + l - 13, x0 + l - 113],
    bas: [x0 + 13, x0 + l - 13],
  };
  const pt = (v) => v * MM;
  const { rectangles, ignores } = rectanglesBandes({
    plaque: { x0: 0, y0: 0, x1: pt(plaqueL), y1: pt(plaqueH) },
    panneau: { x0: pt(x0), y0: pt(y0), x1: pt(x0 + l), y1: pt(y0 + h) },
    reperes: { haut: r.haut.map(pt), bas: r.bas.map(pt) },
    nomHaut: nomHaut && nomHaut.map(pt),
  });
  const mm = (v) => Math.round((v / MM) * 100) / 100;
  return {
    ignores,
    reperes: r,
    rects: rectangles.map((b) => ({ x: mm(b.x), y: mm(b.y), l: mm(b.width), h: mm(b.height), couleur: b.color })),
  };
}

const de = (rects, couleur) => rects.filter((r) => r.couleur === couleur);

describe("bandes d'encrage — géométrie", () => {
  it("125x255 sur 126x260 : bande continue collée au fond perdu sur les deux petits côtés", () => {
    const { rects, ignores } = bandes([1260, 2600], [1260, 2560]);
    assert.deepStrictEqual(ignores, []);
    assert.deepStrictEqual(
      de(rects, NOIR).map(({ x, y, l, h }) => [x, y, l, h]),
      [
        [0, 2580, 1260, 2],
        [0, 18, 1260, 2],
      ],
    );
    assert.deepStrictEqual(
      de(rects, PRESQUE_NOIR).map(({ x, y, l, h }) => [x, y, l, h]),
      [
        [0, 2582, 1260, 2],
        [0, 16, 1260, 2],
      ],
    );
  });

  it("le renfort bleu contourne les repères et le nom", () => {
    const { rects } = bandes([1260, 2600], [1260, 2560], { nomHaut: [400, 860] });
    const bleus = de(rects, BLEU);
    const haut = bleus.filter((r) => r.y > 1300);
    assert.deepStrictEqual(
      haut.map((r) => [r.x, r.x + r.l]),
      [
        [28, 390],
        [870, 1132],
        [1162, 1232],
      ],
    );
    assert.deepStrictEqual(
      bleus.filter((r) => r.y < 1300).map((r) => [r.x, r.x + r.l]),
      [[28, 1232]],
    );
    for (const r of haut) assert.deepStrictEqual([r.y, r.h], [2585, 8]);
  });

  it("un nom plus long que l'intervalle entre repères ne laisse pas de renfort dessous", () => {
    const { rects } = bandes([1010, 2150], [1010, 2110], { nomHaut: [20, 990] });
    assert.strictEqual(de(rects, BLEU).filter((r) => r.y > 1000).length, 0);
  });

  it("toujours au moins 6 mm de blanc entre une bande et le bord d'un repère", () => {
    const cas = [
      [[1010, 2150], [1010, 2110]],
      [[1260, 2600], [1010, 2560]],
      [[1510, 2600], [1510, 2110]],
      [[1500, 3050], [1010, 2110]],
    ];
    for (const [plaque, panneau] of cas) {
      const { rects, reperes } = bandes(plaque, panneau);
      const y0 = (plaque[1] - panneau[1]) / 2;
      const centres = [
        ...reperes.haut.map((x) => [x, plaque[1] - y0 + 13]),
        ...reperes.bas.map((x) => [x, y0 - 13]),
      ];
      for (const [cx, cy] of centres) {
        for (const r of rects) {
          const dx = Math.max(r.x - cx, 0, cx - r.x - r.l);
          const dy = Math.max(r.y - cy, 0, cy - r.y - r.h);
          assert(Math.hypot(dx, dy) >= 9 - 0.02, `${plaque} : bande à ${Math.hypot(dx, dy)} mm du centre`);
        }
      }
    }
  });

  it("125x210 sur 126x260 : grande bande derrière les repères, sans renfort", () => {
    const { rects } = bandes([1260, 2600], [1260, 2110], { nomHaut: [400, 860] });
    assert.deepStrictEqual(
      rects.filter((r) => r.y > 1300).map((r) => [r.y - 2355, r.h, r.l]),
      [
        [0, 2, 1260],
        [2, 2, 1260],
        [26, 25, 1260],
        [51, 25, 1260],
      ],
    );
  });

  it("jamais de bande sur les grands côtés, même avec de la place", () => {
    for (const panneau of [
      [1010, 2560],
      [1010, 2110],
    ]) {
      const { rects } = bandes([1260, 2600], panneau);
      const y0 = (2600 - panneau[1]) / 2;
      assert(rects.length > 0 && rects.every((r) => r.y + r.h <= y0 + 0.01 || r.y >= 2600 - y0 - 0.01));
    }
  });

  it("panneau plus large que la plaque : petits côtés seulement", () => {
    const { rects } = bandes([1250, 2600], [1260, 2110]);
    assert(rects.length > 0 && rects.every((r) => r.h <= 25 && r.x >= 0 && r.x + r.l <= 1250.01));
  });

  it("marge du petit côté sous 20 mm : pas de bande, côté signalé", () => {
    const { rects, ignores } = bandes([1260, 2580], [1260, 2560]);
    assert.deepStrictEqual(rects, []);
    assert.deepStrictEqual(ignores, ["haut", "bas"]);
  });

  it("crédences 300x60 sur 150x305 : le dernier repère n'est pas recouvert", () => {
    const { rects } = bandes([1500, 3050], [1313, 3010], {
      reperes: { haut: [93, 1407], bas: [93, 193, 1407] },
    });
    assert.deepStrictEqual(
      de(rects, BLEU)
        .filter((r) => r.h === 8)
        .map((r) => [r.y > 1500 ? "haut" : "bas", r.x, r.x + r.l]),
      [
        ["haut", 108, 1392],
        ["bas", 108, 178],
        ["bas", 208, 1392],
      ],
    );
  });
});

describe("bandes d'encrage — PDF produits", () => {
  const PRESQUE_NOIR_PDF = "1 1 0.2 0.7 k";
  let dossier;

  before(async () => {
    dossier = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bandes-"));
    for (const [nom, l, h] of [
      ["std", 1260, 2560],
      ["cred", 2560, 610],
    ]) {
      const doc = await PDFDocument.create();
      const page = doc.addPage([l * MM, h * MM]);
      page.drawRectangle({ x: 0, y: 0, width: l * MM, height: h * MM, color: rgb(0.9, 0.9, 0.9) });
      await fs.promises.writeFile(path.join(dossier, `${nom}.pdf`), await doc.save());
    }
  });

  after(() => fs.promises.rm(dossier, { recursive: true, force: true }));

  // Contenu décompressé de la page imprimée.
  async function contenu(fichier) {
    const doc = await PDFDocument.load(await fs.promises.readFile(fichier));
    const flux = doc.getPage(0).node.Contents();
    const parties = flux.asArray ? flux.asArray() : [flux];
    return parties
      .map((r) => doc.context.lookup(r))
      .filter((s) => s instanceof PDFRawStream)
      .map((s) => {
        const octets = Buffer.from(s.contents);
        return (s.dict.get(PDFName.of("Filter")) ? zlib.inflateSync(octets) : octets).toString("latin1");
      })
      .join("\n");
  }

  const noirPur = (c) => c.includes("0 0 0 1 k") && !/^0 0 0 rg$/m.test(c);

  it("standard : bandes dessinées, repères et nom en noir pur", async () => {
    await modifyPdf(path.join(dossier, "std.pdf"), dossier, "avec", "Deco_Std_126x260", true, true);
    const c = await contenu(path.join(dossier, "avec.pdf"));
    assert(c.includes(PRESQUE_NOIR_PDF) && c.includes("1 1 0 0.2 k"));
    assert(noirPur(c));
    assert(/ 30 Tf/.test(c));
  });

  it("standard sans bandes : disposition d'avant, noir pur", async () => {
    await modifyPdf(path.join(dossier, "std.pdf"), dossier, "sans", "Deco_Std_126x260", true, false);
    const c = await contenu(path.join(dossier, "sans.pdf"));
    assert(!c.includes(PRESQUE_NOIR_PDF));
    assert(noirPur(c));
    assert(/ 35 Tf/.test(c));
  });

  it("crédences : bandes selon l'option", async () => {
    const visuals = [1, 2].map((n) => ({ file: path.join(dossier, "cred.pdf"), name: `c${n}` }));
    for (const avec of [true, false]) {
      const sortie = path.join(dossier, `cred-${avec}.pdf`);
      await amalgameCredences({ visuals, plaque: "126x260", bandes: avec }, sortie);
      const c = await contenu(sortie);
      assert.strictEqual(c.includes(PRESQUE_NOIR_PDF), avec);
      assert(noirPur(c));
    }
  });
});
