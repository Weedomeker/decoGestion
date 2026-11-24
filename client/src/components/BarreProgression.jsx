import PropTypes from "prop-types";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "semantic-ui-react";
import "../css/BarreProgression.css";
import { API_BASE } from "../utils/api";
import { formatDuree, formatDureeMs } from "../utils/duree";
import { ETAPES, etatBandeau, formatReste, pourcentageAffiche, projeter } from "../utils/progression";

const ETATS = {
  attente: "En attente",
  cours: "En cours",
  nouvelle: "Nouvelle tentative",
  fait: "Traité",
  echec: "Échec",
  annule: "Annulé, reste en attente",
};
const ETAPES_COURTES = { ...ETAPES, base: "Enreg." };
const TENTATIVES = 3; // attempts de queueControlService

const LOUPE_MIN = 44; // largeur minimale (px) d'un segment grossi
const MARGE_ECRAN = 8;

const urlJpg = (chemin) => `${API_BASE}/public/${chemin.replace(/#/g, "%23")}`;

// Part remplie d'un segment, prolongée depuis le dernier message.
const partRemplie = (job, ecouleMs) => {
  if (job.etat === "fait") return 1;
  if (job.etat === "echec" || job.etat === "annule") return 0;
  return projeter(job.av, job.vitesse, job.plafond, ecouleMs);
};

// Fiche du fichier survolé. `details` : le job de la file (null s'il n'y est plus).
function Fiche({ job, details }) {
  const jpg = job.jpg || (job.etat === "fait" ? details?.jpgName : null);
  const derniere = Object.keys(job.reels).length;
  const attendue = job.etapes[derniere];

  let etatTexte = ETATS[job.etat];
  if (job.etat === "cours") etatTexte = `${formatReste(job.resteMs)} restantes`;
  if (job.etat === "fait") {
    const total = Object.values(job.reels).reduce((somme, s) => somme + s, 0);
    etatTexte = total > 0 ? `Traité en ${formatDuree(total)}` : "Traité";
  }

  let sansJpg = "JPG pas encore prêt";
  if (job.etat === "echec") sansJpg = "Pas de JPG";
  else if (job.etat === "fait") sansJpg = "Aperçu indisponible";

  return (
    <>
      {jpg ? (
        <img className="bp-vignette" src={urlJpg(jpg)} alt="" />
      ) : (
        <div className="bp-vignette bp-vignette--vide">{sansJpg}</div>
      )}
      <div className="bp-details">
        <h3>
          {details?.visuels?.[0] ?? `Commande ${job.cmd}`}
          {details?.visuels?.[1] && <span> + {details.visuels[1]}</span>}
        </h3>
        <div className="bp-fichier">{job.nom ? `${job.nom}.pdf` : details?.fichier}</div>
        {job.raison && (
          <p className={`bp-raison${job.etat === "echec" ? "" : " bp-raison--alerte"}`}>
            {job.etat === "echec"
              ? `Échec : ${job.raison}`
              : `Tentative ${job.tentative}/${TENTATIVES} : ${job.raison}`}
          </p>
        )}
        <dl>
          <dt>Commande</dt>
          <dd>{details?.commande ?? job.cmd}</dd>
          <dt>État</dt>
          <dd>{etatTexte}</dd>
          <dt>Poids</dt>
          <dd>{job.mo > 0 ? `${String(job.mo).replace(".", ",")} Mo` : "—"}</dd>
          <dt>Format</dt>
          <dd>{details?.format || "—"}</dd>
          <dt>Plaque</dt>
          <dd>{details?.plaque || "—"}</dd>
          <dt>Vernis</dt>
          <dd>{details?.vernis || "—"}</dd>
          <dt>Ex.</dt>
          <dd>{details?.ex ?? "—"}</dd>
        </dl>
        <div className="bp-etapes" style={{ gridTemplateColumns: `repeat(${job.etapes.length}, 1fr)` }}>
          {job.etapes.map((etape) => {
            const reel = job.reels[etape];
            const enEchec = job.etat === "echec" && etape === attendue;
            let classe = "";
            let av = 0;
            if (reel !== undefined) {
              classe = "ok";
              av = 1;
            } else if (enEchec) classe = "ko";
            else if (job.etape === etape) {
              classe = "cours";
              av = job.avEtape;
            }
            return (
              <span key={etape} className={classe} style={{ "--av": `${Math.round(av * 100)}%` }}>
                {ETAPES_COURTES[etape]}
                {reel !== undefined && ` ${formatDuree(reel)}`}
                {enEchec && " échec"}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

const jobType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  cmd: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  nom: PropTypes.string,
  mo: PropTypes.number,
  etat: PropTypes.string.isRequired,
  etape: PropTypes.string,
  etapes: PropTypes.arrayOf(PropTypes.string).isRequired,
  avEtape: PropTypes.number,
  reels: PropTypes.objectOf(PropTypes.number).isRequired,
  tentative: PropTypes.number,
  raison: PropTypes.string,
  jpg: PropTypes.string,
  resteMs: PropTypes.number,
});

Fiche.propTypes = {
  job: jobType.isRequired,
  details: PropTypes.shape({
    visuels: PropTypes.arrayOf(PropTypes.string),
    fichier: PropTypes.string,
    commande: PropTypes.string,
    format: PropTypes.string,
    plaque: PropTypes.string,
    vernis: PropTypes.string,
    ex: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    jpgName: PropTypes.string,
  }),
};

// Segment grossi par-dessus la barre, et sa fiche dessous : hors flux, rien ne bouge dans la page.
function Loupe({ ancre, bandeau, piste, job, part, details, idFiche }) {
  const ficheRef = useRef(null);
  const [pose, setPose] = useState(null);

  useLayoutEffect(() => {
    const g = ancre.getBoundingClientRect();
    const p = piste.getBoundingClientRect();
    const b = bandeau.getBoundingClientRect();
    const largeur = Math.max(g.width * 1.12, LOUPE_MIN);
    const centre = g.left + g.width / 2;
    const gauche = Math.max(p.left - 6, Math.min(centre - largeur / 2, p.right + 6 - largeur));
    const largeurFiche = ficheRef.current.offsetWidth;
    const gaucheFiche = Math.max(
      MARGE_ECRAN,
      Math.min(centre - largeurFiche / 2, window.innerWidth - largeurFiche - MARGE_ECRAN),
    );
    setPose({
      loupe: { left: gauche, top: g.top - 9, width: largeur, "--x0": g.width / largeur },
      fiche: { left: gaucheFiche, top: b.bottom + 4, "--ox": `${centre - gaucheFiche}px` },
    });
  }, [ancre, bandeau, piste, job.id]);

  let ton = "var(--accent)";
  if (job.etat === "echec") ton = "var(--danger)";
  else if (job.etat === "nouvelle") ton = "var(--warning)";

  return createPortal(
    <>
      {pose && (
        <div className={`bp-loupe bp-loupe--${job.etat}`} style={pose.loupe}>
          <b style={{ width: `${part * 100}%` }} />
        </div>
      )}
      <div
        ref={ficheRef}
        id={idFiche}
        role="tooltip"
        className={`bp-fiche${pose ? " bp-fiche--posee" : ""}`}
        style={{ ...pose?.fiche, "--ton": ton }}
      >
        <Fiche job={job} details={details} />
      </div>
    </>,
    document.body,
  );
}

Loupe.propTypes = {
  ancre: PropTypes.instanceOf(Element).isRequired,
  bandeau: PropTypes.instanceOf(Element).isRequired,
  piste: PropTypes.instanceOf(Element).isRequired,
  job: jobType.isRequired,
  part: PropTypes.number.isRequired,
  details: PropTypes.object,
  idFiche: PropTypes.string.isRequired,
};

/**
 * Bandeau fixe de la File : même hauteur au repos et en traitement. Un segment par job du dernier lancement,
 * large comme son poids ; le dernier segment est la génération des étiquettes.
 */
function BarreProgression({ progression, recuA, running, paused, detailsDe, onPauseReprise, onAnnuler, onAller }) {
  const [, setTic] = useState(0);
  const [survol, setSurvol] = useState(null); // { id, fiche } : `fiche` faux quand la ligne est survolée
  const [elements, setElements] = useState({ bandeau: null, piste: null });
  const idFiche = useId();
  const pisteRef = useRef(null);

  const poserBandeau = useCallback((n) => setElements((e) => (e.bandeau === n ? e : { ...e, bandeau: n })), []);
  const poserPiste = useCallback((n) => {
    pisteRef.current = n;
    setElements((e) => (e.piste === n ? e : { ...e, piste: n }));
  }, []);

  const enCours = Boolean(progression) && progression.phase !== "fini";

  // Anime la barre entre deux messages sans re-rendre le tableau de la File.
  useEffect(() => {
    if (!enCours) return undefined;
    const minuteur = setInterval(() => setTic((n) => n + 1), 500);
    return () => clearInterval(minuteur);
  }, [enCours]);

  // Ligne survolée dans le tableau : son segment ressort.
  useEffect(() => {
    const panneau = document.getElementById("file-panel");
    if (!panneau) return undefined;
    const entrer = (e) => {
      const id = e.target.closest?.("tr[data-job-id]")?.dataset.jobId ?? null;
      setSurvol((s) => ((s?.id ?? null) === id ? s : id && { id, fiche: false }));
    };
    const sortir = () => setSurvol(null);
    panneau.addEventListener("mouseover", entrer);
    panneau.addEventListener("mouseleave", sortir);
    return () => {
      panneau.removeEventListener("mouseover", entrer);
      panneau.removeEventListener("mouseleave", sortir);
    };
  }, []);

  // La fiche est posée en coordonnées d'écran : elle se ferme si la page bouge dessous.
  useEffect(() => {
    if (!survol?.fiche) return undefined;
    const fermer = () => setSurvol(null);
    window.addEventListener("resize", fermer);
    return () => window.removeEventListener("resize", fermer);
  }, [survol?.fiche]);

  const maintenant = Date.now();
  const ecouleMs = recuA ? maintenant - recuA : 0;
  const etat = etatBandeau(progression, { paused, maintenant, ecouleMs });
  const jobs = progression?.etiquettesSeules ? [] : (progression?.jobs ?? []);
  const pct = progression ? pourcentageAffiche(progression, ecouleMs) : 0;

  const jobSurvole = survol ? jobs.find((job) => job.id === survol.id) : null;
  const ancre =
    jobSurvole && survol.fiche ? elements.piste?.querySelector(`[data-segment="${CSS.escape(survol.id)}"]`) : null;

  // Par la position et non par l'élément : les segments fins et leurs intervalles restent faciles à viser.
  const segmentSous = (x) => {
    const segments = [...(pisteRef.current?.querySelectorAll("[data-segment]") ?? [])];
    return segments.find((segment) => x <= segment.getBoundingClientRect().right + 1)?.dataset.segment ?? null;
  };
  const viser = (id) => setSurvol((s) => (s?.id === id && s?.fiche ? s : id && { id, fiche: true }));

  const clavier = (e) => {
    if (e.key === "Escape") setSurvol(null);
    if (e.key === "Enter" && jobSurvole) onAller(jobSurvole);
    if (!["ArrowLeft", "ArrowRight"].includes(e.key) || jobs.length === 0) return;
    e.preventDefault();
    const pas = e.key === "ArrowRight" ? 1 : -1;
    const i = jobs.findIndex((job) => job.id === survol?.id);
    const depart = pas > 0 ? 0 : jobs.length - 1;
    viser(jobs[i === -1 ? depart : Math.max(0, Math.min(jobs.length - 1, i + pas))].id);
  };

  const phase = progression?.phase;
  const pauseVisible = paused || (running && phase === "jobs");
  const annulerVisible = running && phase === "jobs" && progression.annules === 0;

  let etatEtiquettes = "attente";
  let partEtiquettes = 0;
  if (phase === "etiquettes") etatEtiquettes = "cours";
  if (phase === "fini") {
    etatEtiquettes = progression.avertissement ? "echec" : "fait";
    partEtiquettes = progression.avertissement ? 0 : 1;
  }

  return (
    <div ref={poserBandeau} className={`bp${etat.actif ? "" : " bp--repos"}`} data-ton={etat.ton}>
      <div className="bp-compte">
        {progression ? (
          <>
            {progression.faits}
            <span>/{progression.total}</span>
          </>
        ) : (
          <span>–</span>
        )}
      </div>

      <div className="bp-milieu">
        <div
          ref={poserPiste}
          className={`bp-piste${jobs.length > 25 ? " bp-piste--dense" : ""}${jobSurvole ? " bp-piste--survol" : ""}`}
          role="progressbar"
          tabIndex={jobs.length > 0 ? 0 : -1}
          aria-label="Progression du lancement"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={[...etat.gauche.map((m) => m.texte), etat.droite].filter(Boolean).join(", ")}
          aria-describedby={ancre ? idFiche : undefined}
          onMouseMove={(e) => viser(segmentSous(e.clientX))}
          onMouseLeave={() => setSurvol(null)}
          onBlur={() => setSurvol(null)}
          onKeyDown={clavier}
          onClick={(e) => {
            const id = segmentSous(e.clientX);
            const job = jobs.find((j) => j.id === id);
            if (job) onAller(job);
          }}
        >
          {jobs.map((job) => (
            <span
              key={job.id}
              data-segment={job.id}
              className={`bp-seg bp-seg--${job.etat}${jobSurvole?.id === job.id ? " bp-seg--vise" : ""}`}
              style={{ flexGrow: job.poids }}
            >
              <b style={{ width: `${partRemplie(job, ecouleMs) * 100}%` }} />
            </span>
          ))}
          <span
            className={`bp-seg bp-seg--etiquettes bp-seg--${etatEtiquettes}`}
            style={{ flexGrow: progression?.poidsEtiquettes ?? 1 }}
            title="Génération des étiquettes"
          >
            <b style={{ width: `${partEtiquettes * 100}%` }} />
          </span>
        </div>
        <div className="bp-info">
          <span>
            {etat.gauche.map((morceau, i) => (
              <span key={morceau.texte} className={morceau.ton ? `bp-mot--${morceau.ton}` : undefined}>
                {i > 0 && ", "}
                {morceau.texte}
              </span>
            ))}
          </span>
          <span>{etat.droite}</span>
        </div>
      </div>

      <div className="bp-pct">{etat.actif && <>{pct}&#8239;%</>}</div>

      <div className="bp-actions">
        <Button
          type="button"
          size="small"
          compact
          basic
          className={pauseVisible ? "" : "bp-cache"}
          icon={paused ? "play" : "pause"}
          content={paused ? "Reprendre" : "Pause"}
          onClick={onPauseReprise}
          title={
            paused
              ? "Reprendre le traitement de la file"
              : "Les jobs en cours se terminent, aucun nouveau job ne démarre"
          }
        />
        <Button
          type="button"
          size="small"
          compact
          basic
          negative
          className={annulerVisible ? "" : "bp-cache"}
          icon="stop"
          content="Annuler"
          onClick={onAnnuler}
          title="Retirer les jobs non démarrés du traitement"
        />
      </div>

      {jobSurvole && (
        <style>{`.ui.table.jobs-table tbody tr[data-job-id="${CSS.escape(jobSurvole.id)}"] > td { background: color-mix(in srgb, var(--accent) 16%, var(--bg-elevated)) !important; }`}</style>
      )}
      {ancre && elements.bandeau && (
        <Loupe
          key={jobSurvole.id}
          ancre={ancre}
          bandeau={elements.bandeau}
          piste={elements.piste}
          job={jobSurvole}
          part={partRemplie(jobSurvole, ecouleMs)}
          details={detailsDe(jobSurvole.id)}
          idFiche={idFiche}
        />
      )}
    </div>
  );
}

BarreProgression.propTypes = {
  progression: PropTypes.shape({
    phase: PropTypes.string.isRequired,
    etiquettesSeules: PropTypes.bool,
    total: PropTypes.number,
    faits: PropTypes.number,
    annules: PropTypes.number,
    poidsEtiquettes: PropTypes.number,
    avertissement: PropTypes.string,
    jobs: PropTypes.array,
  }),
  recuA: PropTypes.number,
  running: PropTypes.bool,
  paused: PropTypes.bool,
  detailsDe: PropTypes.func.isRequired,
  onPauseReprise: PropTypes.func.isRequired,
  onAnnuler: PropTypes.func.isRequired,
  onAller: PropTypes.func.isRequired,
};

const BarreProgressionMemo = memo(BarreProgression);
export default BarreProgressionMemo;

// Étiquette d'étape après le visuel, et icône de la première cellule, pour les lignes de la File.
export function EtapeLigne({ job }) {
  if (!job) return null;
  if (job.etat === "echec") {
    return (
      <span className="job-tag job-tag--echec" title={job.raison}>
        échec : {job.raison}
      </span>
    );
  }
  if (job.etat === "nouvelle") {
    return (
      <span className="job-tag job-tag--nouvelle" title={job.raison}>
        nouvelle tentative {Math.min(TENTATIVES, job.tentative + 1)}/{TENTATIVES}
      </span>
    );
  }
  if (job.etat !== "cours" || !job.etape) return null;
  return (
    <span className="job-tag job-tag--etape" style={{ "--av": `${Math.round(job.avEtape * 100)}%` }}>
      {ETAPES[job.etape]}
      {job.tentative > 1 && ` (tentative ${job.tentative})`}
    </span>
  );
}

EtapeLigne.propTypes = { job: jobType };

export function IconeLigne({ job }) {
  const libelle = job.etat === "echec" ? `Échec : ${job.raison}` : ETATS[job.etat];
  const duree = job.resteMs ? `, reste ~${formatDureeMs(Math.ceil(job.resteMs / 1000) * 1000)}` : "";
  return (
    <span className={`job-etat job-etat--${job.etat}`} role="img" aria-label={libelle} title={libelle + duree}>
      {job.etat === "echec" ? "✕" : ""}
    </span>
  );
}

IconeLigne.propTypes = { job: jobType.isRequired };
