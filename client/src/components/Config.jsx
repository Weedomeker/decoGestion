import { useEffect, useState } from "react";
import { Button, ButtonContent, Header, Icon, Input, Modal, ModalActions, ModalContent } from "semantic-ui-react";

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function Config() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({});
  const [saveError, setSaveError] = useState(null);

  // Fonction pour charger les données initiales
  const fetchInitialData = async () => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/config`, {
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

  // Utiliser `useEffect` pour charger les données chaque fois que la modale s'ouvre
  useEffect(() => {
    if (open) {
      setSaveError(null);
      fetchInitialData();
    }
  }, [open]); // `fetchInitialData` est appelé chaque fois que `open` devient `true`

  // Retourne true si succès, false si erreur
  async function fetchDataAndCompare(newData) {
    setSaveError(null);
    try {
      const response = await fetch(`http://${HOST}:${PORT}/config`, {
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

  return (
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
              onChange={(e, v) => {
                setData((prevData) => ({ ...prevData, preview: v.value }));
              }}
            />
            <Input
              fluid
              label="Tauro:"
              value={data.tauro || ""}
              onChange={(e, v) => {
                setData((prevData) => ({ ...prevData, tauro: v.value }));
              }}
            />
            <Input
              fluid
              label="LM:"
              value={data.LM || ""}
              onChange={(e, v) => {
                setData((prevData) => ({ ...prevData, LM: v.value }));
              }}
            />
            <Input
              fluid
              label="ECOM:"
              value={data.ECOM || ""}
              onChange={(e, v) => {
                setData((prevData) => ({ ...prevData, ECOM: v.value }));
              }}
            />
            <Input
              fluid
              label="CASTO:"
              value={data.CASTO || ""}
              onChange={(e, v) => {
                setData((prevData) => ({ ...prevData, CASTO: v.value }));
              }}
            />
            <Input
              fluid
              label="BRICO:"
              value={data.BRICO || ""}
              onChange={(e, v) => {
                setData((prevData) => ({ ...prevData, BRICO: v.value }));
              }}
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
  );
}

export default Config;
