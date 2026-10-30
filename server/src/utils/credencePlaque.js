// Même détection que addJob : (?!\d) évite de capturer "100x25" dans "100x255"
const CREDENCE_RE = /(\d{3})x(\d{2})(?!\d)/i;
const DIMENSIONS_RE = /(\d{2,4})x(\d{2,4})/i;

function credenceDims(format) {
  const match = String(format || "").match(CREDENCE_RE);
  return match ? { length: Number(match[1]), width: Number(match[2]) } : null;
}

// Emprise des crédences posées côte à côte sur la plaque (en portrait, comme formatTauro : largeur x hauteur)
function credenceEmprise(format, format2) {
  const p1 = credenceDims(format);
  if (!p1) return null;
  const p2 = credenceDims(format2);
  return {
    width: p1.width + (p2 ? p2.width : 0),
    height: Math.max(p1.length, p2 ? p2.length : 0),
  };
}

// Emprise requise si la plaque ne contient pas les crédences, sinon null.
// Un 300x60 amalgamé avec un 255x60 sur une 126x260 sortait rogné à 260 cm sans erreur.
function plaqueTropPetite(formatTauro, format, format2) {
  const emprise = credenceEmprise(format, format2);
  const match = String(formatTauro || "").match(DIMENSIONS_RE);
  if (!emprise || !match) return null;
  const plaque = { width: Number(match[1]), height: Number(match[2]) };
  return plaque.width >= emprise.width && plaque.height >= emprise.height ? null : emprise;
}

module.exports = { credenceEmprise, plaqueTropPetite };
