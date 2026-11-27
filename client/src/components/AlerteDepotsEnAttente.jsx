import PropTypes from "prop-types";
import { useState } from "react";
import { Button } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

// PDF de session restés dans le dossier d'attente, jamais envoyés au hot folder (hot folder
// injoignable, arrêt du serveur pendant les envois). « Reprendre le dépôt » les envoie dans l'ordre.
// Les jobs ne sont pas remis dans la file : les relancer imprimerait une 2e fois.
function AlerteDepotsEnAttente({ depots, onReprise }) {
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);
  const { dossier = "", fichiers = [] } = depots;

  async function reprendre() {
    setEnvoi(true);
    setMessage(null);
    try {
      const reponse = await fetch(`${API_BASE}/tauro/reprendre_depot`, { method: "POST" });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(corps.error || `HTTP ${reponse.status}`);
      const sansFiche = corps.sansFiche?.length ? `, ${corps.sansFiche.length} sans fiche à déposer à la main` : "";
      setMessage(
        corps.restants?.length
          ? `${corps.deposes.length} déposé(s), ${corps.restants.length} toujours en attente${sansFiche}`
          : null,
      );
      onReprise();
    } catch (e) {
      setMessage(`Dépôt non repris : ${e.message}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="alerte-reprise-arret" role="alert">
      <div className="alerte-reprise-arret-titre">
        ⚠ {fichiers.length} PDF de session non envoyé(s) au hot folder : ils attendent dans {dossier}. Ne pas relancer
        ces jobs, reprendre le dépôt une fois le hot folder joignable.
      </div>
      <ul>
        {fichiers.map((nom) => (
          <li key={nom}>{nom}</li>
        ))}
      </ul>
      <div className="alerte-reprise-arret-actions">
        {message && <span>{message}</span>}
        <Button size="mini" compact primary onClick={reprendre} loading={envoi} disabled={envoi}>
          Reprendre le dépôt
        </Button>
      </div>
    </div>
  );
}

AlerteDepotsEnAttente.propTypes = {
  depots: PropTypes.shape({
    dossier: PropTypes.string,
    fichiers: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  onReprise: PropTypes.func.isRequired,
};

export default AlerteDepotsEnAttente;
