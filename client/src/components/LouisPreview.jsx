const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import PropTypes from "prop-types";
import { Embed, Modal } from "semantic-ui-react";

function LouisPreview({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} size="large" closeIcon>
      <Modal.Header>Explorateur fichiers</Modal.Header>
      <Modal.Content style={{ height: "70vh", padding: 0 }}>
        <Embed active url={`http://${HOST}:${PORT}/louis`} />
      </Modal.Content>
    </Modal>
  );
}

LouisPreview.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export default LouisPreview;
