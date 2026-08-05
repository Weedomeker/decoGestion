import PropTypes from "prop-types";
import { Button, Modal, Icon } from "semantic-ui-react";

const InfoStockModal = ({ stock, job, open, onClose, onValidate, remaining }) => {
  const requestedEx = parseInt(job?.ex) || 0;
  const availableEx = parseInt(stock?.ex) || 0;
  const isPartial = availableEx > 0 && requestedEx > 0 && availableEx < requestedEx;

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>Visuel en stock</Modal.Header>
      <Modal.Content>
        <p>Visuel : {stock?.visuel?.toLowerCase()}</p>
        <p>Référence : {stock?.ref}</p>
        <p>Finition : {stock?.finition?.toLowerCase()}</p>
        <p>Format : {stock?.format}</p>
        <p>Ex en stock : {stock?.ex}</p>
        {requestedEx > 0 && <p>Ex commandés : {requestedEx}</p>}
        {isPartial && (
          <p style={{ fontWeight: "bold" }}>
            Stock insuffisant pour couvrir toute la commande : {availableEx} ex seront pris en stock, les{" "}
            {requestedEx - availableEx} ex restants seront lancés en production.
          </p>
        )}
        {remaining > 0 && (
          <p style={{ fontStyle: "italic", opacity: 0.7 }}>
            {remaining} autre{remaining > 1 ? "s" : ""} visuel{remaining > 1 ? "s" : ""} en stock à confirmer ensuite.
          </p>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose} color="red">
          <Icon name="remove" /> Annuler
        </Button>
        <Button onClick={onValidate} color="green">
          <Icon name="checkmark" /> {isPartial ? "Utiliser le stock disponible" : "Utiliser"}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

InfoStockModal.propTypes = {
  stock: PropTypes.object,
  job: PropTypes.object,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onValidate: PropTypes.func.isRequired,
  remaining: PropTypes.number,
};

export default InfoStockModal;
