import { useState, useEffect } from 'react';
import { Button, ButtonContent, Header, Icon, Input, Modal, ModalActions, ModalContent } from 'semantic-ui-react';

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function Config() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({
    standards: '',
    raccordables: '',
    surMesures: '',
    ecom: '',
  });

  // Fonction pour charger les données initiales
  const fetchInitialData = async () => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/config`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const responseData = await response.json();
        setData(responseData); // Met à jour l'état avec les données récupérées
      } else {
        console.log('Erreur lors du chargement des données');
      }
    } catch (err) {
      console.error('Erreur de connexion lors du chargement :', err);
    }
  };

  // Utiliser `useEffect` pour charger les données chaque fois que la modale s'ouvre
  useEffect(() => {
    if (open) {
      fetchInitialData();
    }
  }, [open]); // `fetchInitialData` est appelé chaque fois que `open` devient `true`

  // Fonction pour envoyer les données mises à jour au serveur
  async function fetchDataAndCompare(newData) {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData),
      });

      if (response.ok) {
        const responseData = await response.json();
        const isDifferent = Object.entries(data).some(([key, value]) => value !== responseData[key]);

        if (isDifferent) {
          setData(responseData);
          console.log("Les valeurs de l'état ont été mises à jour.");
        } else {
          console.log('Les valeurs sont identiques, pas de mise à jour.');
        }
      }
    } catch (err) {
      console.error('Erreur lors de la connexion :', err);
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
          <Button animated="fade" compact color="black" type="button">
            <ButtonContent visible>
              <Icon name="cogs" fitted />
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
          <Input
            fluid
            label="Standards:"
            value={data.standards || ''}
            onChange={(e, v) => {
              setData((prevData) => ({ ...prevData, standards: v.value }));
            }}
          />
          <Input
            fluid
            label="Raccordables:"
            value={data.raccordables || ''}
            onChange={(e, v) => {
              setData((prevData) => ({ ...prevData, raccordables: v.value }));
            }}
          />
          <Input
            fluid
            label="Sur Mesures:"
            value={data.surMesures || ''}
            onChange={(e, v) => {
              setData((prevData) => ({ ...prevData, surMesures: v.value }));
            }}
          />
          <Input
            fluid
            label="Ecom:"
            value={data.ecom || ''}
            onChange={(e, v) => {
              setData((prevData) => ({ ...prevData, ecom: v.value }));
            }}
          />
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
            await fetchDataAndCompare(data);
            setOpen(false);
          }}
        >
          <Icon name="checkmark" /> Valider
        </Button>
      </ModalActions>
    </Modal>
  );
}

export default Config;
