export function formatPrix(prix) {
  if (prix === null || prix === undefined || Number.isNaN(prix)) return "";
  return `${prix.toFixed(2)} €`;
}
