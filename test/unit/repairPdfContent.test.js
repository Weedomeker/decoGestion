const { expect } = require("chai");
const zlib = require("zlib");
const { PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
const { repairPageContentStreams } = require("../../server/src/utils/repairPdfContent");

const CONTENT = "q\n0 0 1 rg\n0 0 100 100 re\nf\nQ\n";

// Flux Flate volontairement tronqué (fin de bloc + somme Adler-32 manquantes),
// comme sur le source "PAILLETTES 125x210 DROIT 94964355 MAT.pdf".
function truncatedFlate(text) {
  const full = zlib.deflateSync(Buffer.from(text, "latin1"));
  return full.subarray(0, full.length - 3);
}

async function pdfWithContent(bytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const stream = doc.context.flateStream("");
  const raw = PDFRawStream.of(stream.dict, bytes);
  const ref = doc.context.register(raw);
  page.node.set(PDFName.of("Contents"), ref);
  return { doc, page, ref };
}

function readContent(doc, ref) {
  const stream = doc.context.lookup(ref);
  return zlib.inflateSync(Buffer.from(stream.getContents())).toString("latin1");
}

describe("repairPdfContent.repairPageContentStreams()", () => {
  it("le flux tronqué échoue bien à la décompression stricte (pré-condition)", () => {
    expect(() => zlib.inflateSync(truncatedFlate(CONTENT))).to.throw();
  });

  it("réencode un flux de contenu tronqué et en conserve le contenu", async () => {
    const { doc, page, ref } = await pdfWithContent(truncatedFlate(CONTENT));
    const repaired = repairPageContentStreams(doc, page);
    expect(repaired).to.equal(1);
    expect(readContent(doc, ref)).to.equal(CONTENT);
  });

  it("ne touche pas un flux sain", async () => {
    const good = zlib.deflateSync(Buffer.from(CONTENT, "latin1"));
    const { doc, page, ref } = await pdfWithContent(good);
    expect(repairPageContentStreams(doc, page)).to.equal(0);
    expect(Buffer.from(doc.context.lookup(ref).getContents()).equals(good)).to.equal(true);
  });

  it("gère un tableau de flux /Contents", async () => {
    const { doc, page, ref } = await pdfWithContent(truncatedFlate(CONTENT));
    const good = doc.context.register(doc.context.flateStream("Q\n"));
    page.node.set(PDFName.of("Contents"), doc.context.obj([ref, good]));
    expect(repairPageContentStreams(doc, page)).to.equal(1);
    expect(readContent(doc, ref)).to.equal(CONTENT);
  });
});
