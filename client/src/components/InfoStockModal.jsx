import PropTypes from "prop-types";
import { Button, Modal, Icon } from "semantic-ui-react";

const InfoStockModal = ({ stock, open, onClose, onValidate }) => {
  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>Visuel en stock</Modal.Header>
      <Modal.Content>
        <p>Visuel : {stock?.visuel?.toLowerCase()}</p>
        <p>Référence : {stock?.ref}</p>
        <p>Finition : {stock?.finition?.toLowerCase()}</p>
        <p>Format : {stock?.format}</p>
        <p>Ex : {stock?.ex}</p>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose} color="red">
          <Icon name="remove" /> Annuler
        </Button>
        <Button onClick={onValidate} color="green">
          <Icon name="checkmark" /> Utiliser
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

InfoStockModal.propTypes = {
  stock: PropTypes.object.isRequired,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onValidate: PropTypes.func.isRequired,
};

export default InfoStockModal;
