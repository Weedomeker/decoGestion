// Lignes du CSV d'export de l'historique (GET /history/export).

const ENTETE_CSV = "date,client,numCmd,mag,deco,ref,format,finition,ex,temps,perte,prodBlanc,surMesure\n";

// Seuls ces champs sont lus dans Mongo : l'export ne charge pas le reste des documents Deco.
const CHAMPS_CSV = "date client numCmd mag deco ref format finition ex temps perte prodBlanc surMesure";

function csvText(val) {
  if (val === null || val === undefined) return '""';
  return `"${String(val).replace(/"/g, '""')}"`;
}

// YYYY-MM-DD HH:mm, entre guillemets ; "" pour une date absente.
function csvDate(d) {
  if (!d) return '""';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `"${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}"`;
}

const nombre = (val) => (val !== undefined && val !== null ? val : 0);

function ligneCsv(entry) {
  return `${[
    csvDate(entry.date),
    csvText(entry.client),
    nombre(entry.numCmd),
    csvText(entry.mag),
    csvText(entry.deco),
    csvText(entry.ref),
    csvText(entry.format),
    csvText(entry.finition),
    nombre(entry.ex),
    nombre(entry.temps),
    nombre(entry.perte),
    entry.prodBlanc ? 1 : 0,
    entry.surMesure ? 1 : 0,
  ].join(",")}\n`;
}

module.exports = { ENTETE_CSV, CHAMPS_CSV, ligneCsv };
