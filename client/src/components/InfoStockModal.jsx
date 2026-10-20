import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Button, Checkbox, Icon, Modal, Table } from "semantic-ui-react";

// Une seule modale pour tous les visuels en stock d'une soumission : on coche ceux à prendre en stock
const InfoStockModal = ({ items, open, onClose, onValidate }) => {
  const [checked, setChecked] = useState(new Set());

  useEffect(() => {
    if (open) setChecked(new Set());
  }, [open, items]);

  const toggle = (i) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const allChecked = items.length > 0 && checked.size === items.length;

  return (
    <Modal open={open} onClose={onClose} size={items.length > 1 ? "large" : "small"}>
      <Modal.Header>
        {items.length > 1 ? `${items.length} visuels en stock` : "Visuel en stock"}
      </Modal.Header>
      <Modal.Content scrolling>
        <p style={{ opacity: 0.7 }}>Coche les visuels à prendre en stock ; les autres partent en production.</p>
        <Table compact="very" size="small" selectable>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell collapsing>
                <Checkbox
                  checked={allChecked}
                  indeterminate={checked.size > 0 && !allChecked}
                  onChange={() => setChecked(allChecked ? new Set() : new Set(items.map((_, i) => i)))}
                />
              </Table.HeaderCell>
              <Table.HeaderCell>Visuel</Table.HeaderCell>
              <Table.HeaderCell>N° Cmd</Table.HeaderCell>
              <Table.HeaderCell>Finition</Table.HeaderCell>
              <Table.HeaderCell>Format</Table.HeaderCell>
              <Table.HeaderCell textAlign="center">Stock</Table.HeaderCell>
              <Table.HeaderCell textAlign="center">Commandés</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map(({ stock, object }, i) => {
              const requestedEx = parseInt(object?.ex) || 0;
              const availableEx = parseInt(stock?.ex) || 0;
              const isPartial = availableEx > 0 && requestedEx > 0 && availableEx < requestedEx;
              return (
                <Table.Row key={object?._id ?? i} onClick={() => toggle(i)} style={{ cursor: "pointer" }}>
                  <Table.Cell collapsing>
                    <Checkbox checked={checked.has(i)} />
                  </Table.Cell>
                  <Table.Cell>
                    {stock?.visuel?.toLowerCase()}
                    {stock?.ref && <div style={{ fontSize: "0.85em", opacity: 0.6 }}>Réf. {stock.ref}</div>}
                    {isPartial && (
                      <div style={{ fontSize: "0.85em", fontWeight: "bold" }}>
                        Stock partiel : {availableEx} ex en stock, {requestedEx - availableEx} ex en production
                      </div>
                    )}
                  </Table.Cell>
                  <Table.Cell>{object?.cmd}</Table.Cell>
                  <Table.Cell>{stock?.finition?.toLowerCase()}</Table.Cell>
                  <Table.Cell>{stock?.format}</Table.Cell>
                  <Table.Cell textAlign="center">{availableEx}</Table.Cell>
                  <Table.Cell textAlign="center">{requestedEx || "—"}</Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>
          <Icon name="remove" /> Tout en production
        </Button>
        <Button
          onClick={() => onValidate(items.filter((_, i) => checked.has(i)))}
          color="green"
          disabled={checked.size === 0}
        >
          <Icon name="checkmark" /> Utiliser le stock ({checked.size})
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

InfoStockModal.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({ stock: PropTypes.object, object: PropTypes.object })).isRequired,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onValidate: PropTypes.func.isRequired,
};

export default InfoStockModal;
