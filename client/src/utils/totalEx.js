// Total d'ex. de la File en attente (pied de JobsList), avec le détail par plaque en infobulle.
// Ex. = plaques, comme les sessions Tauro (une crédence dupliquée de 3 panneaux = 2 plaques).
// Les jobs pris en stock ne partent pas en session : comptés à part, hors détail par plaque.

const plaqueCourte = (job) =>
  String(job.format_Plaque || "")
    .split("_")
    .pop() || "?";
// Même règle que le serveur (finitionDe) : « brillant » dans le nom, sinon Mat.
const estBrillant = (job) => /brillant/i.test(`${job.visuel || ""} ${job.smBase || ""}`);
const surface = (f) => {
  const m = /(\d+)x(\d+)/.exec(f);
  return m ? Number(m[1]) * Number(m[2]) : -1;
};

/**
 * @param {object[]} jobs jobs de la File (ou de la sélection)
 * @returns {{ex:number, stock:number, formats:{plaque:string, ex:number, mat:number, brillant:number}[]}}
 *   formats : du plus grand au plus petit, comme l'ordre des sessions
 */
export function totalEx(jobs) {
  const parPlaque = new Map();
  let ex = 0;
  let stock = 0;
  for (const job of jobs) {
    const n = Number(job.ex) || 0;
    ex += n;
    if (job.useStock) {
      stock += n;
      continue;
    }
    const plaque = plaqueCourte(job);
    const f = parPlaque.get(plaque) || { plaque, ex: 0, mat: 0, brillant: 0 };
    f.ex += n;
    if (estBrillant(job)) f.brillant += n;
    else f.mat += n;
    parPlaque.set(plaque, f);
  }
  const formats = [...parPlaque.values()].sort(
    (a, b) => surface(b.plaque) - surface(a.plaque) || a.plaque.localeCompare(b.plaque),
  );
  return { ex, stock, formats };
}

/** « 24 ex. — Mat 20 · Brillant 4 » ; une seule finition : « 24 ex. — Mat » */
export function ligneFormat(f) {
  const parts = [f.mat && `Mat ${f.mat}`, f.brillant && `Brillant ${f.brillant}`].filter(Boolean);
  return `${f.ex} ex. — ${parts.length > 1 ? parts.join(" · ") : f.brillant ? "Brillant" : "Mat"}`;
}
