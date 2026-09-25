const zlib = require("zlib");
const { PDFName, PDFArray, PDFRef, PDFRawStream } = require("pdf-lib");

// Certains PDF source (ex. export Illustrator) ont un flux de contenu Flate tronqué :
// les lecteurs tolérants l'affichent, mais le RIP s'arrête sur l'erreur et n'imprime
// plus rien de ce qui suit (repères, texte ajoutés par pdf-lib). On décompresse en
// mode tolérant et on réécrit un flux propre.
function isFlateOnly(dict) {
  if (dict.get(PDFName.of("DecodeParms"))) return false;
  const filter = dict.get(PDFName.of("Filter"));
  if (filter instanceof PDFArray) {
    return filter.size() === 1 && filter.get(0) === PDFName.of("FlateDecode");
  }
  return filter === PDFName.of("FlateDecode");
}

function repairPageContentStreams(pdfDoc, page) {
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let repaired = 0;

  for (const ref of refs) {
    if (!(ref instanceof PDFRef)) continue;
    const stream = pdfDoc.context.lookup(ref);
    if (!(stream instanceof PDFRawStream) || !isFlateOnly(stream.dict)) continue;

    const raw = Buffer.from(stream.getContents());
    try {
      zlib.inflateSync(raw);
      continue; // flux sain
    } catch {
      // flux abîmé → réparation ci-dessous
    }

    let decoded;
    try {
      decoded = zlib.inflateSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    } catch {
      continue; // irrécupérable : on laisse tel quel
    }
    pdfDoc.context.assign(ref, pdfDoc.context.flateStream(decoded));
    repaired++;
  }
  return repaired;
}

module.exports = { repairPageContentStreams };
