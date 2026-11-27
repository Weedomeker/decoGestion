import { useEffect, useState } from "react";
import { Button, Icon, Input, Loader, Modal, ModalActions, ModalContent } from "semantic-ui-react";
import Dropdown from "./AutoDropdown";
import { API_BASE } from "../utils/api";

// Mise en page des JPG des jobs (nom du fichier en en-tête). Défaut serveur : A4 portrait.
const JPG_PAGE_FORMATS = [
  { key: "A4", value: "A4", text: "A4" },
  { key: "A3", value: "A3", text: "A3" },
  { key: "none", value: "none", text: "Désactivée (JPG brut)" },
];
const JPG_PAGE_ORIENTATIONS = [
  { key: "portrait", value: "portrait", text: "Portrait" },
  { key: "paysage", value: "paysage", text: "Paysage" },
];

function Config() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [browser, setBrowser] = useState({
    open: false,
    field: null,
    current: "",
    parent: null,
    dirs: [],
    loading: false,
    error: null,
  });

  const fetchInitialData = async () => {
    try {
      const response = await fetch(`${API_BASE}/config`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const responseData = await response.json();
        setData(responseData);
      } else {
        setSaveError(`Erreur chargement config (${response.status})`);
      }
    } catch (err) {
      console.error("Erreur de connexion lors du chargement :", err);
    }
  };

  useEffect(() => {
    if (open) {
      setSaveError(null);
      fetchInitialData();
    }
  }, [open]);

  async function fetchDataAndCompare(newData) {
    setSaveError(null);
    try {
      const response = await fetch(`${API_BASE}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newData),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setSaveError(err.error || `Erreur serveur (${response.status})`);
        return false;
      }

      const responseData = await response.json();
      const isDifferent = Object.entries(data).some(([key, value]) => value !== responseData[key]);
      if (isDifferent) setData(responseData);
      return true;
    } catch (err) {
      setSaveError("Impossible de joindre le serveur.");
      return false;
    }
  }

  const fetchDirs = async (dirPath) => {
    setBrowser((b) => ({ ...b, loading: true, error: null }));
    try {
      const res = await fetch(`${API_BASE}/browse?path=${encodeURIComponent(dirPath)}`);
      const json = await res.json();
      if (!res.ok) {
        setBrowser((b) => ({ ...b, loading: false, error: json.error || "Erreur serveur" }));
      } else {
        setBrowser((b) => ({
          ...b,
          loading: false,
          current: json.current,
          parent: json.parent,
          dirs: json.dirs,
        }));
      }
    } catch {
      setBrowser((b) => ({ ...b, loading: false, error: "Impossible de joindre le serveur." }));
    }
  };

  const openBrowser = (field) => {
    const currentPath = data[field] || "";
    setBrowser({
      open: true,
      field,
      current: currentPath,
      parent: null,
      dirs: [],
      loading: !!currentPath,
      error: null,
    });
    if (currentPath) fetchDirs(currentPath);
  };

  const selectCurrentDir = () => {
    setData((prev) => ({ ...prev, [browser.field]: browser.current }));
    setBrowser((b) => ({ ...b, open: false }));
  };

  // Un champ de chemin : libellé aligné, saisie pleine largeur, bouton Parcourir.
  const champ = (field, label) => (
    <div className="config-champ">
      <label htmlFor={`config-${field}`}>{label}</label>
      <Input
        id={`config-${field}`}
        fluid
        value={data[field] || ""}
        title={data[field] || ""}
        onChange={(e, v) => setData((prev) => ({ ...prev, [field]: v.value }))}
        action={
          <Button
            icon
            type="button"
            title="Parcourir"
            aria-label={`Parcourir : ${label}`}
            onClick={() => openBrowser(field)}
          >
            <Icon name="folder open" />
          </Button>
        }
      />
    </div>
  );

  return (
    <>
      <Modal
        className="config-modal"
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        size="small"
        trigger={
          <button type="button" className="header-action-btn" title="Configuration des dossiers réseau">
            <Icon name="cogs" fitted />
            Config
          </button>
        }
      >
        <Modal.Header>
          <Icon name="cogs" /> Configuration
        </Modal.Header>
        <ModalContent scrolling>
          {saveError && <p className="config-erreur">{saveError}</p>}

          <section className="config-section">
            <h4>Sorties</h4>
            {champ("preview", "Aperçus")}
            {champ("tauro", "Tauro (hot folder)")}
            {champ("attenteTauro", "Attente Tauro (vide = dépôt direct)")}
          </section>

          <section className="config-section">
            <h4>Sur-mesure</h4>
            {champ("SM", "PDF créa")}
            {champ("decoupeSM", "Découpe")}
          </section>

          <section className="config-section">
            <h4>Visuels par enseigne</h4>
            {champ("LM", "LM")}
            {champ("ECOM", "ECOM")}
            {champ("CASTO", "CASTO")}
            {champ("BRICO", "BRICO")}
          </section>

          <section className="config-section">
            <h4>Page JPG</h4>
            <div className="config-champ">
              <span className="config-libelle">Mise en page</span>
              <div className="config-page-jpg">
                <Dropdown
                  selection
                  options={JPG_PAGE_FORMATS}
                  value={data.jpgPage?.format || "A4"}
                  onChange={(e, v) =>
                    setData((prev) => ({ ...prev, jpgPage: { orientation: "portrait", ...prev.jpgPage, format: v.value } }))
                  }
                  aria-label="Format de page JPG"
                />
                <Dropdown
                  selection
                  options={JPG_PAGE_ORIENTATIONS}
                  disabled={data.jpgPage?.format === "none"}
                  value={data.jpgPage?.orientation || "portrait"}
                  onChange={(e, v) =>
                    setData((prev) => ({ ...prev, jpgPage: { format: "A4", ...prev.jpgPage, orientation: v.value } }))
                  }
                  aria-label="Orientation de page JPG"
                />
              </div>
            </div>
          </section>
        </ModalContent>
        <ModalActions>
          <Button type="button" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            primary
            type="button"
            onClick={async () => {
              const ok = await fetchDataAndCompare(data);
              if (ok) setOpen(false);
            }}
          >
            <Icon name="checkmark" /> Enregistrer
          </Button>
        </ModalActions>
      </Modal>

      <Modal
        className="config-browser"
        open={browser.open}
        onClose={() => setBrowser((b) => ({ ...b, open: false }))}
        size="small"
        closeIcon
      >
        <Modal.Header>
          <Icon name="folder open" /> Sélectionner un dossier
        </Modal.Header>
        <ModalContent>
          <div className="config-browser-chemin">{browser.current || "(aucun chemin défini)"}</div>

          {browser.loading && (
            <div className="config-browser-attente">
              <Loader active inline="centered" />
            </div>
          )}

          {!browser.loading && browser.error && <p className="config-erreur">{browser.error}</p>}

          {!browser.loading && !browser.error && (
            <>
              {browser.parent !== null && (
                <button
                  type="button"
                  className="config-browser-ligne config-browser-parent"
                  onClick={() => fetchDirs(browser.parent)}
                >
                  <Icon name="arrow up" fitted />
                  Dossier parent
                </button>
              )}

              {browser.dirs.length === 0 && (
                <p className="config-browser-vide">
                  {browser.current
                    ? "Aucun sous-dossier"
                    : "Entrez un chemin dans le champ pour démarrer la navigation."}
                </p>
              )}

              <div className="config-browser-liste">
                {browser.dirs.map((dir) => (
                  <button
                    type="button"
                    key={dir}
                    className="config-browser-ligne"
                    onClick={() => fetchDirs(`${browser.current}\\${dir}`)}
                  >
                    <Icon name="folder" fitted />
                    <span>{dir}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </ModalContent>
        <ModalActions>
          <Button type="button" onClick={() => setBrowser((b) => ({ ...b, open: false }))}>
            Annuler
          </Button>
          <Button primary type="button" onClick={selectCurrentDir} disabled={!browser.current}>
            <Icon name="checkmark" /> Sélectionner ce dossier
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}

export default Config;
