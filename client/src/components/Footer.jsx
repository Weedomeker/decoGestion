import PropTypes from "prop-types";

// Barre d'état de l'atelier : ce qu'il faut savoir avant de lancer un job, et les raccourcis clavier.
// Les données viennent de GET /health (interrogé toutes les 30 s par ServerStatus).

const GO = 2 ** 30;
const SEUIL_ALERTE = 20 * GO; // orange
const SEUIL_CRITIQUE = 5 * GO; // rouge
const PARTAGES = ["LM", "CASTO", "BRICO", "ECOM", "TAURO", "SM"];

const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null);

function formatGo(octets) {
  const go = octets / GO;
  return `${go < 10 ? go.toFixed(1).replace(".", ",") : Math.round(go)} Go`;
}

function niveauDisque(mesure) {
  if (!mesure) return "inconnu";
  if (mesure.libre < SEUIL_CRITIQUE) return "ko";
  if (mesure.libre < SEUIL_ALERTE) return "alerte";
  return "ok";
}

function Point({ etat }) {
  return <span className={`statusbar-dot statusbar-dot--${etat}`} aria-hidden="true" />;
}
Point.propTypes = { etat: PropTypes.oneOf(["ok", "alerte", "ko", "inconnu"]).isRequired };

function Disque({ label, mesure }) {
  const niveau = niveauDisque(mesure);
  const titre = mesure ? `${mesure.dossier} : ${formatGo(mesure.libre)} libres` : `${label} : espace non mesurable`;
  return (
    <span className={`statusbar-item statusbar-item--${niveau}`} title={titre}>
      {label}{" "}
      <strong>
        {niveau === "alerte" || niveau === "ko" ? "▲ " : ""}
        {mesure ? formatGo(mesure.libre) : "?"}
      </strong>
    </span>
  );
}
Disque.propTypes = {
  label: PropTypes.string.isRequired,
  mesure: PropTypes.shape({ dossier: PropTypes.string, libre: PropTypes.number }),
};

function Partage({ nom, ok, depuis }) {
  const etat = ok === true ? "ok" : ok === false ? "ko" : "inconnu";
  const titre =
    ok === false
      ? `${nom} injoignable${depuis ? ` depuis ${heure(depuis)}` : ""}`
      : ok === true
        ? `${nom} accessible`
        : `${nom} : état inconnu`;
  return (
    <span className={`statusbar-item statusbar-item--${etat}`} title={titre}>
      {ok === false ? <span className="statusbar-cross" aria-hidden="true">✕</span> : <Point etat={etat} />}
      {nom}
    </span>
  );
}
Partage.propTypes = { nom: PropTypes.string.isRequired, ok: PropTypes.bool, depuis: PropTypes.string };

const MO = 2 ** 20;
const formatRam = (octets) => (octets >= GO ? formatGo(octets) : `${Math.round(octets / MO)} Mo`);
const pct = (valeur) => (valeur == null ? "…" : `${valeur} %`);

// Processus Node seul ; le détail du poste (conversions ImageMagick comprises) est dans l'infobulle.
function Ressources({ ressources }) {
  if (!ressources) return null;
  const { appli, poste } = ressources;
  const ramPostePct = poste.ramTotale ? (poste.ramUtilisee / poste.ramTotale) * 100 : 0;
  const charge = (appli.cpu ?? 0) >= 80 || (poste.cpu ?? 0) >= 90 || ramPostePct >= 90;
  const titre = [
    `Appli (serveur Node) : CPU ${pct(appli.cpu)}, RAM ${formatRam(appli.ram)}`,
    `Poste : CPU ${pct(poste.cpu)}, RAM ${formatRam(poste.ramUtilisee)} / ${formatRam(poste.ramTotale)}`,
    "Les conversions PDF/JPG (ImageMagick) ne comptent que dans « Poste ».",
  ].join("\n");
  return (
    <span className="statusbar-groupe" title={titre}>
      <span className="statusbar-label">Appli</span>
      <span className={`statusbar-item${charge ? " statusbar-item--alerte" : ""}`}>
        CPU <strong>{pct(appli.cpu)}</strong>
      </span>
      <span className={`statusbar-item${charge ? " statusbar-item--alerte" : ""}`}>
        RAM <strong>{formatRam(appli.ram)}</strong>
      </span>
    </span>
  );
}
Ressources.propTypes = {
  ressources: PropTypes.shape({
    appli: PropTypes.shape({ cpu: PropTypes.number, ram: PropTypes.number }),
    poste: PropTypes.shape({ cpu: PropTypes.number, ramUtilisee: PropTypes.number, ramTotale: PropTypes.number }),
  }),
};

const RACCOURCIS = [
  ["Alt+1…6", "vues"],
  ["/", "dossier"],
  ["Ctrl+Entrée", "ajouter"],
];

function Footer({ health }) {
  const horsLigne = health?.status === "offline";
  const symlinks = health?.symlinks ?? {};
  const depuis = health?.symlinksDepuis ?? {};
  const etatService = (valeur) => (!health || horsLigne ? "inconnu" : valeur === "connected" ? "ok" : "ko");

  return (
    <footer className="statusbar" aria-label="État de l'atelier">
      <div className="statusbar-etat">
        {health?.env === "dev" && <span className="statusbar-env">DEV</span>}

        {horsLigne ? (
          <span className="statusbar-item statusbar-item--ko">
            <Point etat="ko" />
            Serveur injoignable
          </span>
        ) : (
          <>
            <span className="statusbar-groupe">
              <span className="statusbar-label">Disque</span>
              <Disque label="Sortie" mesure={health?.disque?.sortie} />
              <Disque label="Temp" mesure={health?.disque?.temp} />
            </span>

            <span className="statusbar-groupe">
              <span className="statusbar-label">Partages</span>
              {PARTAGES.map((nom) => (
                <Partage key={nom} nom={nom} ok={health ? symlinks[nom] : undefined} depuis={depuis[nom]} />
              ))}
            </span>

            <Ressources ressources={health?.ressources} />

            <span className="statusbar-groupe">
              <span className="statusbar-item" title={`Gamesys (ODBC) : ${health?.odbc ?? "…"}`}>
                <Point etat={etatService(health?.odbc)} />
                Gamesys
              </span>
              <span className="statusbar-item" title={`MongoDB : ${health?.mongodb ?? "…"}`}>
                <Point etat={etatService(health?.mongodb)} />
                Mongo{health?.mongoBase ? <strong>&nbsp;{health.mongoBase}</strong> : null}
              </span>
            </span>
          </>
        )}
      </div>

      <div className="statusbar-raccourcis" aria-label="Raccourcis clavier">
        {RACCOURCIS.map(([touches, action]) => (
          <span key={touches}>
            <kbd>{touches}</kbd> {action}
          </span>
        ))}
      </div>
    </footer>
  );
}

Footer.propTypes = {
  health: PropTypes.shape({
    status: PropTypes.string,
    env: PropTypes.string,
    odbc: PropTypes.string,
    mongodb: PropTypes.string,
    mongoBase: PropTypes.string,
    symlinks: PropTypes.object,
    symlinksDepuis: PropTypes.object,
    disque: PropTypes.shape({ sortie: PropTypes.object, temp: PropTypes.object }),
    ressources: PropTypes.object,
  }),
};

export default Footer;
