import { useEffect, useState } from "react";
import {
  Button,
  ButtonContent,
  Header,
  Icon,
  Input,
  Loader,
  Modal,
  ModalActions,
  ModalContent,
} from "semantic-ui-react";
import { API_BASE } from "../utils/api";

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

  const browseBtn = (field) => (
    <Button icon type="button" title="Parcourir" onClick={() => openBrowser(field)}>
      <Icon name="folder open" />
    </Button>
  );

  return (
    <>
      <Modal
        basic
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        size="small"
        trigger={
          <div className="config-button">
            <Button animated="fade" color="black" type="button">
              <ButtonContent visible>
                <Icon name="cogs" />
              </ButtonContent>
              <ButtonContent hidden>Config</ButtonContent>
            </Button>
          </div>
        }
      >
        <Header icon>
          <Icon name="cogs" />
          Configuration
        </Header>
        <div className="config">
          <ModalContent scrolling>
            {saveError && <p style={{ color: "red", margin: "0 0 8px" }}>{saveError}</p>}
            <div className="input-folders">
              <Input
                fluid
                label="Aperçu:"
                value={data.preview || ""}
                onChange={(e, v) => setData((prev) => ({ ...prev, preview: v.value }))}
                action={browseBtn("preview")}
              />
              <Input
                fluid
                label="Tauro:"
                value={data.tauro || ""}
                onChange={(e, v) => setData((prev) => ({ ...prev, tauro: v.value }))}
                action={browseBtn("tauro")}
              />
              <Input
                fluid
                label="LM:"
                value={data.LM || ""}
                onChange={(e, v) => setData((prev) => ({ ...prev, LM: v.value }))}
                action={browseBtn("LM")}
              />
              <Input
                fluid
                label="ECOM:"
                value={data.ECOM || ""}
                onChange={(e, v) => setData((prev) => ({ ...prev, ECOM: v.value }))}
                action={browseBtn("ECOM")}
              />
              <Input
                fluid
                label="CASTO:"
                value={data.CASTO || ""}
                onChange={(e, v) => setData((prev) => ({ ...prev, CASTO: v.value }))}
                action={browseBtn("CASTO")}
              />
              <Input
                fluid
                label="BRICO:"
                value={data.BRICO || ""}
                onChange={(e, v) => setData((prev) => ({ ...prev, BRICO: v.value }))}
                action={browseBtn("BRICO")}
              />
            </div>
          </ModalContent>
        </div>
        <ModalActions>
          <Button basic color="red" inverted onClick={() => setOpen(false)}>
            <Icon name="remove" /> Annuler
          </Button>
          <Button
            color="green"
            inverted
            onClick={async () => {
              const ok = await fetchDataAndCompare(data);
              if (ok) setOpen(false);
            }}
          >
            <Icon name="checkmark" /> Valider
          </Button>
        </ModalActions>
      </Modal>

      <Modal
        open={browser.open}
        onClose={() => setBrowser((b) => ({ ...b, open: false }))}
        size="small"
        closeIcon
      >
        <Header>
          <Icon name="folder open" />
          Sélectionner un dossier
        </Header>
        <ModalContent>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "#555",
              marginBottom: 12,
              wordBreak: "break-all",
              background: "#f5f5f5",
              padding: "6px 10px",
              borderRadius: 4,
            }}
          >
            {browser.current || "(aucun chemin défini)"}
          </div>

          {browser.loading && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <Loader active inline="centered" />
            </div>
          )}

          {!browser.loading && browser.error && (
            <p style={{ color: "red" }}>{browser.error}</p>
          )}

          {!browser.loading && !browser.error && (
            <>
              {browser.parent !== null && (
                <div
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    marginBottom: 6,
                    background: "#eef2ff",
                    borderRadius: 4,
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => fetchDirs(browser.parent)}
                >
                  <Icon name="arrow up" style={{ margin: 0 }} />
                  Dossier parent
                </div>
              )}

              {browser.dirs.length === 0 && (
                <p style={{ color: "#999", fontStyle: "italic" }}>
                  {browser.current
                    ? "Aucun sous-dossier"
                    : "Entrez un chemin dans le champ pour démarrer la navigation."}
                </p>
              )}

              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {browser.dirs.map((dir) => (
                  <div
                    key={dir}
                    style={{
                      padding: "7px 12px",
                      cursor: "pointer",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "background 0.1s",
                    }}
                    onClick={() => fetchDirs(`${browser.current}\\${dir}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f0f0")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Icon name="folder" color="yellow" style={{ margin: 0 }} />
                    <span>{dir}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ModalContent>
        <ModalActions>
          <Button onClick={() => setBrowser((b) => ({ ...b, open: false }))}>
            <Icon name="remove" /> Annuler
          </Button>
          <Button color="green" onClick={selectCurrentDir} disabled={!browser.current}>
            <Icon name="checkmark" /> Sélectionner ce dossier
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}

export default Config;
