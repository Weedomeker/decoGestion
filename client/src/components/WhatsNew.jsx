import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Button, Modal, ModalActions, ModalContent, ModalHeader } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

const STORAGE_KEY = "lastSeenVersion";

// localStorage peut être indisponible (navigation privée, stockage bloqué) : jamais bloquant.
function readLastSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(version) {
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {
    // stockage indisponible : la fenêtre se rouvrira simplement au prochain chargement
  }
}

async function fetchChangelog(query) {
  const response = await fetch(`${API_BASE}/changelog?${query}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function WhatsNew({ currentVersion, manualOpen, onManualClose }) {
  const [entries, setEntries] = useState([]);
  const [autoOpen, setAutoOpen] = useState(false);

  // Ouverture automatique, une seule fois, après une mise à jour de l'appli.
  useEffect(() => {
    if (!currentVersion) return;
    const lastSeen = readLastSeen();
    if (!lastSeen) {
      // Première visite : rien à annoncer, on mémorise la version courante.
      writeLastSeen(currentVersion);
      return;
    }
    if (lastSeen === currentVersion) return;

    // Liste vide (CHANGELOG.md pas encore copié en prod) : on ne mémorise PAS la version,
    // pour que les nouveautés s'affichent dès que le fichier sera là.
    fetchChangelog(`since=${encodeURIComponent(lastSeen)}`)
      .then((list) => {
        if (list.length > 0) {
          setEntries(list);
          setAutoOpen(true);
        }
      })
      .catch((error) => console.error("Erreur chargement du changelog :", error));
  }, [currentVersion]);

  useEffect(() => {
    if (!manualOpen) return;
    fetchChangelog("limit=5")
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [manualOpen]);

  const close = () => {
    if (currentVersion) writeLastSeen(currentVersion);
    setAutoOpen(false);
    onManualClose?.();
  };

  return (
    <Modal open={autoOpen || manualOpen} onClose={close} size="small">
      <ModalHeader>Quoi de neuf ?</ModalHeader>
      <ModalContent scrolling>
        {entries.length === 0 ? (
          <p>Aucune note de version disponible.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.version} className="whatsnew-entry">
              <h3 className="whatsnew-version">
                v{entry.version}
                {entry.date && (
                  <span className="whatsnew-date"> — {new Date(entry.date).toLocaleDateString("fr-FR")}</span>
                )}
              </h3>
              {Object.keys(entry.sections).length === 0 && <p className="whatsnew-empty">Maintenance interne.</p>}
              {Object.entries(entry.sections).map(([title, items]) => (
                <div key={title} className="whatsnew-section">
                  <h4>{title}</h4>
                  <ul>
                    {items.map((item, i) => (
                      <li key={i}>
                        {item.scope && <strong>{item.scope}</strong>}
                        {item.scope && " : "}
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))
        )}
      </ModalContent>
      <ModalActions>
        <Button primary onClick={close}>
          OK
        </Button>
      </ModalActions>
    </Modal>
  );
}

WhatsNew.propTypes = {
  currentVersion: PropTypes.string,
  manualOpen: PropTypes.bool,
  onManualClose: PropTypes.func,
};

export default WhatsNew;
