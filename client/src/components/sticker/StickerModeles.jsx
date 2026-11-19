import PropTypes from "prop-types";
import { useState } from "react";
import { Button, Confirm, Form, Input, Modal, Popup } from "semantic-ui-react";
import Dropdown from "../AutoDropdown";

const CLIENTS = [
  { key: "", value: "", text: "Toutes enseignes" },
  { key: "LM", value: "LM", text: "LM" },
  { key: "CASTO", value: "CASTO", text: "CASTO" },
  { key: "BRICO", value: "BRICO", text: "BRICO" },
  { key: "ECOM", value: "ECOM", text: "ECOM" },
];

function StickerModeles({ modeles, modeleId, client, modifie, enCours, onChoisir, onNouveau, nomSuggere, onEnregistrer, onEnregistrerSous, onDefinirDefaut, onSupprimer }) {
  const [sousOuvert, setSousOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [clientNouveau, setClientNouveau] = useState("");
  const [suppression, setSuppression] = useState(false);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const enseigne = client || "LM";

  const courant = modeles.find((m) => m._id === modeleId);
  const options = modeles.map((m) => ({
    key: m._id,
    value: m._id,
    text: `${m.client ? `${m.client} · ` : ""}${m.nom}`,
    icon: m.parDefaut ? "star" : undefined,
    description: m.parDefaut ? "par défaut" : undefined,
  }));

  const ouvrirSous = () => {
    setNom(courant ? `${courant.nom} (copie)` : nomSuggere || "");
    setClientNouveau(courant?.client || client || "");
    setSousOuvert(true);
  };

  const valider = async () => {
    if (!nom.trim()) return;
    const ok = await onEnregistrerSous(nom.trim(), clientNouveau || null);
    if (ok) setSousOuvert(false);
  };

  return (
    <div className="sk-modeles">
      <Popup
        on="click"
        open={nouveauOuvert}
        onOpen={() => setNouveauOuvert(true)}
        onClose={() => setNouveauOuvert(false)}
        position="bottom left"
        className="sk-popup"
        trigger={<Button size="small" icon="plus" content="Nouveau" disabled={enCours} />}
      >
        <div className="sk-menu">
          <button
            type="button"
            className="sk-menu__item"
            onClick={() => {
              setNouveauOuvert(false);
              onNouveau("vierge");
            }}
          >
            <span>Étiquette vierge</span>
            <em>page blanche</em>
          </button>
          <button
            type="button"
            className="sk-menu__item"
            onClick={() => {
              setNouveauOuvert(false);
              onNouveau("enseigne");
            }}
          >
            <span>Copie du modèle {enseigne}</span>
            <em>modèle par défaut</em>
          </button>
        </div>
      </Popup>
      <Dropdown
        selection
        search
        className="sk-modeles__liste"
        placeholder={modeleId ? "Modèle d'étiquette" : "Nouvelle étiquette"}
        options={options}
        value={modeleId || null}
        onChange={(_, d) => onChoisir(d.value)}
        noResultsMessage="Aucun modèle"
      />
      {modifie && (
        <span className="sk-modeles__modifie" title="Modifications non enregistrées">
          {courant ? "● modifié" : "● non enregistré"}
        </span>
      )}
      <Button.Group size="small">
        <Button
          icon="save"
          content="Enregistrer"
          disabled={!courant || !modifie || enCours}
          loading={enCours}
          onClick={onEnregistrer}
        />
        <Button icon="copy outline" content="Enregistrer sous…" disabled={enCours} onClick={ouvrirSous} />
      </Button.Group>
      <Button
        size="small"
        basic
        icon="star outline"
        title={courant?.client ? `Utiliser ce modèle pour toutes les étiquettes ${courant.client}` : "Choisissez d'abord l'enseigne du modèle (Enregistrer sous…)"}
        aria-label="Définir par défaut"
        content="Par défaut"
        disabled={!courant || courant.parDefaut || !courant.client || modifie || enCours}
        onClick={onDefinirDefaut}
      />
      <Button
        size="small"
        basic
        icon="trash alternate outline"
        title={courant?.parDefaut ? "Modèle par défaut : désignez-en un autre avant de le supprimer" : "Supprimer le modèle"}
        aria-label="Supprimer le modèle"
        disabled={!courant || courant.parDefaut || enCours}
        onClick={() => setSuppression(true)}
      />

      <Modal size="tiny" open={sousOuvert} onClose={() => setSousOuvert(false)}>
        <Modal.Header>Enregistrer le modèle</Modal.Header>
        <Modal.Content>
          <Form onSubmit={valider}>
            <Form.Field>
              <label>Nom</label>
              <Input autoFocus value={nom} onChange={(ev) => setNom(ev.target.value)} placeholder="Ex : LM fragile" maxLength={80} />
            </Form.Field>
            <Form.Field>
              <label>Enseigne</label>
              <Dropdown selection options={CLIENTS} value={clientNouveau} onChange={(_, d) => setClientNouveau(d.value)} />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button basic content="Annuler" onClick={() => setSousOuvert(false)} />
          <Button primary icon="save" content="Enregistrer" disabled={!nom.trim() || enCours} loading={enCours} onClick={valider} />
        </Modal.Actions>
      </Modal>

      <Confirm
        open={suppression}
        size="tiny"
        header="Supprimer le modèle"
        content={`Supprimer « ${courant?.nom || ""} » ? Cette action est définitive.`}
        cancelButton="Annuler"
        confirmButton="Supprimer"
        onCancel={() => setSuppression(false)}
        onConfirm={() => {
          setSuppression(false);
          onSupprimer();
        }}
      />
    </div>
  );
}

StickerModeles.propTypes = {
  modeles: PropTypes.arrayOf(PropTypes.object).isRequired,
  modeleId: PropTypes.string,
  client: PropTypes.string,
  modifie: PropTypes.bool,
  enCours: PropTypes.bool,
  onChoisir: PropTypes.func.isRequired,
  onNouveau: PropTypes.func.isRequired,
  nomSuggere: PropTypes.string,
  onEnregistrer: PropTypes.func.isRequired,
  onEnregistrerSous: PropTypes.func.isRequired,
  onDefinirDefaut: PropTypes.func.isRequired,
  onSupprimer: PropTypes.func.isRequired,
};

export default StickerModeles;
