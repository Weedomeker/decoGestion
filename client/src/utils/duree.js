// Durée lisible à partir d'un nombre de secondes : « 4,2 s », « 45 s », « 3 min 12 s », « 1 h 05 min ».
// Copie de server/src/utils/duree.js : garder les deux versions alignées.
export function formatDuree(secondes) {
  if (secondes == null || secondes === "") return "—";
  const n = Number(secondes);
  if (!Number.isFinite(n) || n < 0) return "—";

  if (n < 10) return `${n.toFixed(1).replace(".", ",").replace(",0", "")} s`;
  const total = Math.round(n);
  if (total < 60) return `${total} s`;
  if (total < 3600) {
    const s = total % 60;
    return s ? `${Math.floor(total / 60)} min ${s} s` : `${total / 60} min`;
  }
  const minutes = Math.round(total / 60);
  const m = minutes % 60;
  return m ? `${Math.floor(minutes / 60)} h ${String(m).padStart(2, "0")} min` : `${minutes / 60} h`;
}

export function formatDureeMs(ms) {
  return ms == null || ms === "" ? "—" : formatDuree(Number(ms) / 1000);
}
