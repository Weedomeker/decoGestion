const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const logger = require("./logger/logger");

// Dimensions en pixels à 150 dpi (portrait). Le paysage inverse largeur/hauteur.
const PAGE_FORMATS = {
  A4: { width: 1240, height: 1754 },
  A3: { width: 1754, height: 2480 },
};
const DEFAULT_PAGE = { format: "A4", orientation: "portrait" };
const MARGIN = 60;
const HEADER_GAP = 30;

// `jpgPage` est un objet dans config.json (et non une string) pour que linkFolders ne tente pas d'en faire un symlink.
// format "none" → mise en page désactivée, le JPG brut est conservé.
function resolvePageOptions(jpgPage) {
  const format = jpgPage?.format ?? DEFAULT_PAGE.format;
  if (format === "none") return null;
  const dims = PAGE_FORMATS[format] || PAGE_FORMATS[DEFAULT_PAGE.format];
  const landscape = (jpgPage?.orientation ?? DEFAULT_PAGE.orientation) === "paysage";
  return landscape ? { width: dims.height, height: dims.width } : { ...dims };
}

// Les polices bitmap de Jimp ne contiennent que l'ASCII : les accents sont retirés pour ne pas afficher de trous.
function toAscii(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

// Remplace `jpgPath` par une page blanche au format configuré : nom du fichier en en-tête,
// visuel réduit pour tenir dans l'espace restant et centré.
async function composeJpgPage(jpgPath, jpgPage) {
  const page = resolvePageOptions(jpgPage);
  if (!page) return false;
  if (!fs.existsSync(jpgPath) || fs.statSync(jpgPath).size === 0) {
    throw new Error(`JPG introuvable pour la mise en page : ${jpgPath}`);
  }

  const title = toAscii(path.basename(jpgPath, path.extname(jpgPath)));
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const textWidth = page.width - 2 * MARGIN;
  const headerHeight = Jimp.measureTextHeight(font, title, textWidth);

  const visuel = await Jimp.read(jpgPath);
  const areaTop = MARGIN + headerHeight + HEADER_GAP;
  const areaWidth = page.width - 2 * MARGIN;
  const areaHeight = page.height - areaTop - MARGIN;
  visuel.scaleToFit(areaWidth, areaHeight);

  const sheet = new Jimp(page.width, page.height, 0xffffffff);
  sheet.print(font, MARGIN, MARGIN, { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, textWidth);
  sheet.composite(
    visuel,
    MARGIN + Math.round((areaWidth - visuel.bitmap.width) / 2),
    areaTop + Math.round((areaHeight - visuel.bitmap.height) / 2),
  );
  sheet.quality(90);
  await sheet.writeAsync(jpgPath);

  logger.info(`🖼️ Mise en page JPG ${jpgPage?.format ?? DEFAULT_PAGE.format} : ${path.basename(jpgPath)}`);
  return true;
}

module.exports = { composeJpgPage, resolvePageOptions, PAGE_FORMATS };
