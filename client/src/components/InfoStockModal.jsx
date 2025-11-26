import PropTypes from 'prop-types';
import { Button, Modal } from 'semantic-ui-react';

const InfoStockModal = ({ stock, open, onClose }) => {
  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>Visuel en stock</Modal.Header>
      <Modal.Content>
        <h4>{stock.join(' ')}ex(s)</h4>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Ok</Button>
      </Modal.Actions>
    </Modal>
  );
};

InfoStockModal.propTypes = {
  stock: PropTypes.array.isRequired,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default InfoStockModal;
