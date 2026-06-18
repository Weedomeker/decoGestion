import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Confirm, Form, Icon, Image, Input, Modal, Table } from "semantic-ui-react";
import "../css/ReferencesView.css";
import { API_BASE } from "../utils/api";

const BASE_URL = API_BASE;

const CLIENTS = ["LM", "CASTO", "BRICO", "ECOM"];
const CLIENT_ICONS = { LM: "leaf", CASTO: "home", BRICO: "wrench", ECOM: "shopping cart" };
const clientColor = (c) => {
  if (c === "LM") return "green";
  if (c === "CASTO") return "blue";
  if (c === "ECOM") return "teal";
  return "orange";
};

const EMPTY_FORM = { ref: "", model: "", finition: "", format: "", blanc: false };

function ReferencesView() {
  const [client, setClient] = useState("LM");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null); // null = formulaire fermé, "new" = création
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [previewList, setPreviewList] = useState([]);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkReport, setCheckReport] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE_URL}/path`)
      .then((res) => res.json())
      .then((data) => {
        if (data[0]?.Preview) setPreviewList(data[0].Preview);
      })
      .catch(() => setPreviewList([]));
  }, []);

  const fetchItems = useCallback(async (selectedClient, query) => {
    setLoading(true);
    setListError(null);
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : "";
      const response = await fetch(`${BASE_URL}/references/${selectedClient}${params}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Erreur serveur (${response.status})`);
      }
      const data = await response.json();
      setItems(data);
    } catch (err) {
      setListError(err.message || "Impossible de joindre le serveur.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(client, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchItems(client, value), 280);
  };

  const openCreateForm = () => {
    setFormError(null);
    setFormData(EMPTY_FORM);
    setEditingId("new");
  };

  const openEditForm = (item) => {
    setFormError(null);
    setFormData({
      ref: item.ref || "",
      model: item.model || "",
      finition: item.finition || "",
      format: item.format || "",
      blanc: Boolean(item.blanc),
    });
    setEditingId(item._id);
  };

  const closeForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const submitForm = async () => {
    setFormError(null);
    const isCreate = editingId === "new";
    const url = isCreate ? `${BASE_URL}/references/${client}` : `${BASE_URL}/references/${client}/${editingId}`;
    try {
      const response = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setFormError(err.error || `Erreur serveur (${response.status})`);
        return;
      }
      closeForm();
      fetchItems(client, search);
    } catch (err) {
      setFormError("Impossible de joindre le serveur.");
    }
  };

  const openPreview = (item) => {
    const matched = previewList.find((p) => p.name.includes(String(item.ref)));
    setPreviewUrl(matched ? `${BASE_URL}/${matched.path.split("\\").slice(1).join("/")}` : null);
    setPreviewItem(item);
  };

  const closePreview = () => {
    setPreviewItem(null);
    setPreviewUrl(null);
  };

  const runCheck = async () => {
    setCheckLoading(true);
    setCheckError(null);
    try {
      const response = await fetch(`${BASE_URL}/references-check`);
      if (!response.ok) throw new Error(`Erreur serveur (${response.status})`);
      const data = await response.json();
      setCheckReport(data);
      setCheckModalOpen(true);
    } catch (err) {
      setCheckError(err.message || "Impossible de joindre le serveur.");
    } finally {
      setCheckLoading(false);
    }
  };

  const createFromOrphan = (entry) => {
    setCheckModalOpen(false);
    setClient(entry.client);
    setFormError(null);
    setFormData({ ref: entry.ref || "", model: "", finition: "", format: entry.format || "", blanc: false });
    setEditingId("new");
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${BASE_URL}/references/${client}/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setListError(err.error || `Erreur serveur (${response.status})`);
        return;
      }
      fetchItems(client, search);
    } catch (err) {
      setListError("Impossible de joindre le serveur.");
    }
  };

  return (
    <div className="references-view">
      <div className="references-toolbar">
        <Button.Group className="client-selector">
          {CLIENTS.map((c) => (
            <Button
              key={c}
              toggle
              type="button"
              active={client === c}
              color={client === c ? clientColor(c) : undefined}
              icon={CLIENT_ICONS[c]}
              content={c}
              onClick={() => {
                closeForm();
                setClient(c);
              }}
            />
          ))}
        </Button.Group>

        <Input
          icon="search"
          placeholder="Rechercher par référence ou modèle…"
          value={search}
          onChange={(e, v) => handleSearchChange(v.value)}
          className="references-search"
        />

        <Button primary type="button" icon="plus" content="Ajouter" onClick={openCreateForm} />
        <Button
          type="button"
          icon="sync"
          loading={checkLoading}
          disabled={checkLoading}
          content="Vérifier les références"
          onClick={runCheck}
        />
      </div>

      {listError && <p className="references-error">{listError}</p>}
      {checkError && <p className="references-error">{checkError}</p>}

      {editingId && (
        <div className="references-form form-section--accented" data-client={client}>
          <Form error={Boolean(formError)} onSubmit={submitForm}>
            <Form.Group widths="equal">
              <Form.Field>
                <label>Référence</label>
                <Input value={formData.ref} onChange={(e, v) => setFormData((d) => ({ ...d, ref: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Modèle</label>
                <Input value={formData.model} onChange={(e, v) => setFormData((d) => ({ ...d, model: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Finition</label>
                <Input value={formData.finition} onChange={(e, v) => setFormData((d) => ({ ...d, finition: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Format</label>
                <Input value={formData.format} onChange={(e, v) => setFormData((d) => ({ ...d, format: v.value }))} />
              </Form.Field>
              {client === "ECOM" && (
                <Form.Field>
                  <label>Blanc</label>
                  <Checkbox
                    checked={formData.blanc}
                    onChange={(e, v) => setFormData((d) => ({ ...d, blanc: v.checked }))}
                  />
                </Form.Field>
              )}
            </Form.Group>
            {formError && <p className="references-error">{formError}</p>}
            <div className="references-form-actions">
              <Button basic type="button" onClick={closeForm}>
                Annuler
              </Button>
              <Button primary type="submit">
                {editingId === "new" ? "Créer" : "Enregistrer"}
              </Button>
            </div>
          </Form>
        </div>
      )}

      <div className="references-table-wrapper">
        <Table compact celled className="references-table">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Référence</Table.HeaderCell>
              <Table.HeaderCell>Modèle</Table.HeaderCell>
              <Table.HeaderCell>Finition</Table.HeaderCell>
              <Table.HeaderCell>Format</Table.HeaderCell>
              {client === "ECOM" && <Table.HeaderCell>Blanc</Table.HeaderCell>}
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {!loading && items.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={client === "ECOM" ? 6 : 5}>Aucune référence trouvée.</Table.Cell>
              </Table.Row>
            )}
            {items.map((item) => (
              <Table.Row key={item._id}>
                <Table.Cell>{item.ref}</Table.Cell>
                <Table.Cell className="references-model-cell" onClick={() => openPreview(item)} title="Voir l'aperçu du visuel">
                  {item.model}
                </Table.Cell>
                <Table.Cell>{item.finition}</Table.Cell>
                <Table.Cell>{item.format}</Table.Cell>
                {client === "ECOM" && (
                  <Table.Cell>{item.blanc ? <Icon name="check" color="green" /> : null}</Table.Cell>
                )}
                <Table.Cell>
                  <Button compact size="mini" icon="pencil" onClick={() => openEditForm(item)} title="Modifier" />
                  <Button
                    compact
                    size="mini"
                    color="red"
                    icon="trash"
                    onClick={() => setConfirmDeleteId(item._id)}
                    title="Supprimer"
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>

      <Modal open={previewItem !== null} onClose={closePreview} size="small" closeIcon>
        <Modal.Header>
          {previewItem?.model} — {previewItem?.ref}
        </Modal.Header>
        <Modal.Content image scrolling>
          {previewUrl ? (
            <Image wrapped size="large" src={previewUrl} alt="Aperçu du visuel" />
          ) : (
            <p>Aucun aperçu disponible pour cette référence.</p>
          )}
        </Modal.Content>
      </Modal>

      <Modal open={checkModalOpen} onClose={() => setCheckModalOpen(false)} size="large" closeIcon scrolling>
        <Modal.Header>
          Rapport de vérification
          {checkReport?.scannedAt ? ` — ${new Date(checkReport.scannedAt).toLocaleString("fr-FR")}` : ""}
        </Modal.Header>
        <Modal.Content scrolling>
          {CLIENTS.map((c) => {
            const r = checkReport?.[c];
            if (!r) return null;

            if (r.networkUnavailable) {
              return (
                <div key={c} className="references-check-client">
                  <h4>{c}</h4>
                  <p className="references-check-warning">Réseau inaccessible — scan ignoré.</p>
                </div>
              );
            }

            return (
              <div key={c} className="references-check-client">
                <h4>{c}</h4>
                <p>
                  {r.stats?.filesScanned ?? 0} fichiers scannés · {r.stats?.refsInDb ?? 0} références en base
                </p>

                <div className="references-check-section">
                  <strong>Fichiers sans référence en base ({r.orphanFiles.length})</strong>
                  {r.orphanFiles.length === 0 ? (
                    <p>Aucun écart.</p>
                  ) : (
                    <Table compact celled size="small">
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>Fichier</Table.HeaderCell>
                          <Table.HeaderCell>Réf. extraite</Table.HeaderCell>
                          <Table.HeaderCell>Action</Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {r.orphanFiles.map((o) => (
                          <Table.Row key={o.filePath}>
                            <Table.Cell>{o.fileName}</Table.Cell>
                            <Table.Cell>{o.ref || <em>non extraite</em>}</Table.Cell>
                            <Table.Cell>
                              <Button
                                compact
                                size="mini"
                                primary
                                disabled={!o.ref}
                                content="Créer"
                                onClick={() => createFromOrphan(o)}
                              />
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </div>

                <div className="references-check-section">
                  <strong>Références en base sans fichier ({r.missingFiles.length})</strong>
                  {r.missingFiles.length === 0 ? (
                    <p>Aucun écart.</p>
                  ) : (
                    <Table compact celled size="small">
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>Référence</Table.HeaderCell>
                          <Table.HeaderCell>Modèle</Table.HeaderCell>
                          <Table.HeaderCell>Format</Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {r.missingFiles.map((m) => (
                          <Table.Row key={m.ref}>
                            <Table.Cell>{m.ref}</Table.Cell>
                            <Table.Cell>{m.model}</Table.Cell>
                            <Table.Cell>{m.format}</Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </div>

                <div className="references-check-section">
                  <strong>Incohérences de format ({r.formatMismatches.length})</strong>
                  {r.formatMismatches.length === 0 ? (
                    <p>Aucun écart.</p>
                  ) : (
                    <Table compact celled size="small">
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>Référence</Table.HeaderCell>
                          <Table.HeaderCell>Fichier</Table.HeaderCell>
                          <Table.HeaderCell>Format fichier</Table.HeaderCell>
                          <Table.HeaderCell>Format base</Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {r.formatMismatches.map((m) => (
                          <Table.Row key={`${m.ref}-${m.fileName}`}>
                            <Table.Cell>{m.ref}</Table.Cell>
                            <Table.Cell>{m.fileName}</Table.Cell>
                            <Table.Cell>{m.fileFormat}</Table.Cell>
                            <Table.Cell>{m.dbFormat}</Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </div>

                <div className="references-check-section">
                  <strong>Références absentes de Gamesys ({r.gamesys?.notFoundInGamesys?.length ?? 0})</strong>
                  {r.gamesys?.unavailable ? (
                    <p className="references-check-warning">Gamesys inaccessible — vérification ignorée.</p>
                  ) : !r.gamesys?.notFoundInGamesys?.length ? (
                    <p>Aucun écart.</p>
                  ) : (
                    <Table compact celled size="small">
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>Référence</Table.HeaderCell>
                          <Table.HeaderCell>Modèle</Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {r.gamesys.notFoundInGamesys.map((m) => (
                          <Table.Row key={`gm-nf-${m.ref}`}>
                            <Table.Cell>{m.ref}</Table.Cell>
                            <Table.Cell>{m.model}</Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </div>
              </div>
            );
          })}
        </Modal.Content>
      </Modal>

      <Confirm
        open={confirmDeleteId !== null}
        header="Supprimer cette référence ?"
        content="Cette action est irréversible."
        confirmButton="Supprimer"
        cancelButton="Annuler"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}

export default ReferencesView;
