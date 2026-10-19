const DIMENSIONS_RE = /(\d{2,4})x(\d{2,4})/i;

function parseDimensions(value) {
  const match = String(value || "").match(DIMENSIONS_RE);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

// Format plaque Tauro correspondant au format Gamesys. Sans correspondance exacte, on prend la plus
// petite plaque qui le contient : Gamesys indique 125x260 pour les BLANC ZERO 125x2xx alors que la
// liste Tauro n'a que 126x260 — sans ce repli la ligne partait avec formatTauro vide (refus 400).
export function findFormatTauro(formatTauro, format) {
  const token = String(format || "").toLowerCase();
  if (!token || !Array.isArray(formatTauro)) return "";

  const exact = formatTauro.find((value) => String(value).toLowerCase().includes(token));
  if (exact) return exact;

  const wanted = parseDimensions(token);
  if (!wanted) return "";

  let best = "";
  let bestArea = Infinity;
  for (const value of formatTauro) {
    const plate = parseDimensions(value);
    if (!plate || plate.width < wanted.width || plate.height < wanted.height) continue;
    const area = plate.width * plate.height;
    if (area < bestArea) {
      best = value;
      bestArea = area;
    }
  }
  return best;
}
