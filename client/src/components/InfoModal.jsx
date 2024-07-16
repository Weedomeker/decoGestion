const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Button, Input, Message, Modal } from 'semantic-ui-react';
const InfoModal = ({ open, onClose, message, object, error }) => {
  const [data, setData] = useState(object);
  const visuel = object && object.visuel ? object.visuel.split('/').pop().split('-').pop().split(' ')[0] : '';

  useEffect(() => {
    setData(object);
  }, [object]);

  //POST data
  const updateJob = async () => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/edit_job`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Une erreur est survenue');
      }

      onClose(); // Fermer le modal après une mise à jour réussie
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>Information</Modal.Header>
      <Modal.Content>
        {error ? (
          <Message negative>
            <Message.Header>Erreur</Message.Header>
            <p>{error}</p>
          </Message>
        ) : (
          <Message negative>
            <Message.Header>{message}</Message.Header>
            {object && (
              <pre>{`${object.cmd} ${object.ville} ${visuel} ${object.ref} ${object.format_visu} ${object.format_Plaque.split('_').pop()} ${object.ex}ex(s)`}</pre>
            )}
          </Message>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Input
          content={object && object.ex}
          label="Ajouter ex"
          type="number"
          onChange={(e) => {
            const newValue = parseInt(e.target.value);
            const matchEx = data.jpgName.match(/\d_EX/gi);
            const newJpgName = data.jpgName.replace(matchEx, newValue + '_EX');
            setData({ ...data, ex: newValue, jpgName: newJpgName });
          }}
        />
        <Button
          onClick={() => {
            updateJob();
          }}
        >
          Valider
        </Button>
        <Button onClick={onClose}>Fermer</Button>
      </Modal.Actions>
    </Modal>
  );
};

InfoModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  message: PropTypes.string.isRequired,
  object: PropTypes.object,
  error: PropTypes.string,
};

export default InfoModal;
