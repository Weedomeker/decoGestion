import PropTypes from "prop-types";
import { useState } from "react";
import { Button } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

// Serveur arrêté pendant un traitement : jobs retirés au redémarrage (retirerJobsOrphelins).
// Reste affiché sur tous les postes jusqu'à « Vu ».
function AlerteRepriseArret({ reprise, onVu }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const { date, enCours = [], attente = [], attenteSupprimes = [], attenteRestants = [] } = reprise;
  const heure = date
    ? new Date(date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  async function vu() {
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch(`${API_BASE}/reprise_arret`, { method: "DELETE" });
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      onVu();
    } catch (e) {
      setErreur(`Non enregistré : ${e.message}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="alerte-reprise-arret" role="alert">
      <div className="alerte-reprise-arret-titre">
        ⚠ Le serveur s&apos;est arrêté pendant un traitement{heure ? ` (redémarré le ${heure})` : ""} : ces jobs
        n&apos;ont pas été relancés.
      </div>
      {enCours.length > 0 && (
        <div>
          <strong>En cours d&apos;envoi — vérifier dans Asanti s&apos;ils sont partis à l&apos;impression avant de les relancer :</strong>
          <ul>
            {enCours.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {attente.length > 0 && (
        <div>
          <strong>Pas encore traités — à rajouter dans la file :</strong>
          <ul>
            {attente.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {attenteRestants.length > 0 && (
        <div>
          <strong>
            Restés en attente de dépôt, jamais envoyés au hot folder — à déposer dans l&apos;ordre des noms, ou à
            relancer :
          </strong>
          <ul>
            {attenteRestants.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {attenteSupprimes.length > 0 && (
        <div>
          <strong>PDF en attente supprimés (jamais envoyés, à relancer avec leur job) :</strong>
          <ul>
            {attenteSupprimes.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="alerte-reprise-arret-actions">
        {erreur && <span>{erreur}</span>}
        <Button size="mini" compact onClick={vu} loading={envoi} disabled={envoi}>
          Vu
        </Button>
      </div>
    </div>
  );
}

AlerteRepriseArret.propTypes = {
  reprise: PropTypes.shape({
    date: PropTypes.string,
    enCours: PropTypes.arrayOf(PropTypes.string),
    attente: PropTypes.arrayOf(PropTypes.string),
    attenteSupprimes: PropTypes.arrayOf(PropTypes.string),
    attenteRestants: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  onVu: PropTypes.func.isRequired,
};

export default AlerteRepriseArret;
