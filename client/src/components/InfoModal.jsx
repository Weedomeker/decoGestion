const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Button, Input, Message, Modal } from "semantic-ui-react";
const InfoModal = ({ open, onClose, message, object, error, warning }) => {
  const [data, setData] = useState(object);
  const [saveError, setSaveError] = useState(null);
  const visuelName =
    object?.visuel
      ?.split("/")
      ?.pop()
      ?.replace(/\.pdf$/i, "") || "";
  const visuel2Name =
    object?.visuel2
      ?.split("/")
      ?.pop()
      ?.replace(/\.pdf$/i, "") || "";

  useEffect(() => {
    setData(object);
    setSaveError(null);
  }, [object]);

  //POST data
  const updateJob = async () => {
    setSaveError(null);
    try {
      const response = await fetch(`http://${HOST}:${PORT}/edit_job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Une erreur est survenue");
      }

      onClose();
    } catch (err) {
      console.error(err);
      setSaveError(err.message || "Erreur lors de la sauvegarde.");
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
          <>
            <Message positive>
              <Message.Header>{message}</Message.Header>
              {object && (
                <pre>
                  {`Cmd: ${object.cmd} | ${object.ville} | Réf: ${object.ref || "—"}\nVisuel: ${visuelName}\nFormat: ${object.format_visu} → ${object.format_Plaque?.split("_")?.pop()} | ${object.ex} ex`}
                  {object.visuel2
                    ? `\n\n2e panneau :\nCmd: ${object.cmd2 || object.cmd} | Réf: ${object.ref2 || "—"}\nVisuel: ${visuel2Name}`
                    : ""}
                </pre>
              )}
            </Message>
            {warning && (
              <Message warning>
                <Message.Header>Attention</Message.Header>
                <p>{warning}</p>
              </Message>
            )}
          </>
        )}
      </Modal.Content>
      {saveError && (
        <Modal.Content>
          <Message negative>
            <Message.Header>Erreur de sauvegarde</Message.Header>
            <p>{saveError}</p>
          </Message>
        </Modal.Content>
      )}
      <Modal.Actions>
        {object && (
          <>
            <Input
              content={object.ex}
              label="Ajouter ex"
              type="number"
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                const matchEx = data.jpgName.match(/\d_EX/i);
                const newJpgName = matchEx ? data.jpgName.replace(matchEx[0], newValue + "_EX") : data.jpgName;
                setData({ ...data, ex: newValue, jpgName: newJpgName });
              }}
            />
            <Button onClick={() => updateJob()}>Valider</Button>
          </>
        )}
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
  warning: PropTypes.string,
};

export default InfoModal;
