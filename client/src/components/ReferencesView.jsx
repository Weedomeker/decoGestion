import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Confirm, Form, Icon, Image, Input, Modal, Select, Table } from "semantic-ui-react";
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
const EMPTY_PK_FORM = { ref: "", modele: "", libelle: "", type: "profil", codeArticle: "", famille: "", sousFamille: "", stockDisponible: 0 };
const TYPE_OPTIONS = [{ key: "profil", value: "profil", text: "Profil" }, { key: "kit", value: "kit", text: "Kit de pose" }];

function sortItems(arr, col, dir) {
  if (!col) return arr;
  return [...arr].sort((a, b) => {
    const av = a[col] ?? "";
    const bv = b[col] ?? "";
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "fr", { sensitivity: "base" });
    return dir === "ascending" ? cmp : -cmp;
  });
}

function ReferencesView() {
  const [client, setClient] = useState("LM");
  const isProfilsKits = client === "PROFILS";

  // ── état visuels ──────────────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
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
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("ascending");

  // ── état profils & kits ───────────────────────────────────────────────────
  const [pkItems, setPkItems] = useState([]);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkError, setPkError] = useState(null);
  const [pkSearch, setPkSearch] = useState("");
  const [pkEditingId, setPkEditingId] = useState(null);
  const [pkFormData, setPkFormData] = useState(EMPTY_PK_FORM);
  const [pkFormError, setPkFormError] = useState(null);
  const [pkConfirmDeleteId, setPkConfirmDeleteId] = useState(null);
  const [pkSortCol, setPkSortCol] = useState(null);
  const [pkSortDir, setPkSortDir] = useState("ascending");

  const debounceRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE_URL}/path`)
      .then((r) => r.json())
      .then((d) => { if (d[0]?.Preview) setPreviewList(d[0].Preview); })
      .catch(() => setPreviewList([]));
  }, []);

  // ── fetch visuels ─────────────────────────────────────────────────────────
  const fetchItems = useCallback(async (selectedClient, query) => {
    setLoading(true);
    setListError(null);
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : "";
      const res = await fetch(`${BASE_URL}/references/${selectedClient}${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur serveur (${res.status})`);
      }
      setItems(await res.json());
    } catch (err) {
      setListError(err.message || "Impossible de joindre le serveur.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── fetch profils & kits ──────────────────────────────────────────────────
  const fetchPk = useCallback(async (q) => {
    setPkLoading(true);
    setPkError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`${BASE_URL}/stock-profiles?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur serveur (${res.status})`);
      }
      setPkItems(await res.json());
    } catch (err) {
      setPkError(err.message || "Impossible de joindre le serveur.");
      setPkItems([]);
    } finally {
      setPkLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isProfilsKits) {
      fetchPk(pkSearch);
    } else {
      fetchItems(client, search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const switchClient = (c) => {
    closeForm();
    closePkForm();
    setSearch("");
    setPkSearch("");
    setSortCol(null);
    setSortDir("ascending");
    setPkSortCol(null);
    setPkSortDir("ascending");
    setClient(c);
  };

  // ── tri ───────────────────────────────────────────────────────────────────
  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "ascending" ? "descending" : "ascending"));
    else { setSortCol(col); setSortDir("ascending"); }
  };

  const handlePkSort = (col) => {
    if (pkSortCol === col) setPkSortDir((d) => (d === "ascending" ? "descending" : "ascending"));
    else { setPkSortCol(col); setPkSortDir("ascending"); }
  };

  const sorted = (col) => sortCol === col ? sortDir : null;
  const pkSorted = (col) => pkSortCol === col ? pkSortDir : null;

  const sortedItems = sortItems(items, sortCol, sortDir);
  const sortedPkItems = sortItems(pkItems, pkSortCol, pkSortDir);

  // ── visuels handlers ──────────────────────────────────────────────────────
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchItems(client, value), 280);
  };

  const openCreateForm = () => { setFormError(null); setFormData(EMPTY_FORM); setEditingId("new"); };
  const openEditForm = (item) => {
    setFormError(null);
    setFormData({ ref: item.ref || "", model: item.model || "", finition: item.finition || "", format: item.format || "", blanc: Boolean(item.blanc) });
    setEditingId(item._id);
  };
  const closeForm = () => { setEditingId(null); setFormData(EMPTY_FORM); setFormError(null); };

  const submitForm = async () => {
    setFormError(null);
    const isCreate = editingId === "new";
    const url = isCreate ? `${BASE_URL}/references/${client}` : `${BASE_URL}/references/${client}/${editingId}`;
    try {
      const res = await fetch(url, { method: isCreate ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setFormError(err.error || `Erreur serveur (${res.status})`); return; }
      closeForm();
      fetchItems(client, search);
    } catch { setFormError("Impossible de joindre le serveur."); }
  };

  const openPreview = (item) => {
    const matched = previewList.find((p) => p.name.includes(String(item.ref)));
    setPreviewUrl(matched ? `${BASE_URL}/${matched.path.split("\\").slice(1).join("/")}` : null);
    setPreviewItem(item);
  };
  const closePreview = () => { setPreviewItem(null); setPreviewUrl(null); };

  const runCheck = async () => {
    setCheckLoading(true); setCheckError(null);
    try {
      const res = await fetch(`${BASE_URL}/references-check`);
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      setCheckReport(await res.json());
      setCheckModalOpen(true);
    } catch (err) { setCheckError(err.message || "Impossible de joindre le serveur."); }
    finally { setCheckLoading(false); }
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
      const res = await fetch(`${BASE_URL}/references/${client}/${id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setListError(err.error || `Erreur serveur (${res.status})`); return; }
      fetchItems(client, search);
    } catch { setListError("Impossible de joindre le serveur."); }
  };

  // ── profils & kits handlers ───────────────────────────────────────────────
  const handlePkSearchChange = (value) => {
    setPkSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPk(value), 280);
  };

  const openPkCreateForm = () => { setPkFormError(null); setPkFormData(EMPTY_PK_FORM); setPkEditingId("new"); };
  const openPkEditForm = (item) => {
    setPkFormError(null);
    setPkFormData({ ref: item.ref || "", modele: item.modele || "", libelle: item.libelle || "", type: item.type || "profil", codeArticle: item.codeArticle || "", famille: item.famille || "", sousFamille: item.sousFamille || "", stockDisponible: item.stockDisponible ?? 0 });
    setPkEditingId(item._id);
  };
  const closePkForm = () => { setPkEditingId(null); setPkFormData(EMPTY_PK_FORM); setPkFormError(null); };

  const submitPkForm = async () => {
    setPkFormError(null);
    const isCreate = pkEditingId === "new";
    const url = isCreate ? `${BASE_URL}/stock-profiles` : `${BASE_URL}/stock-profiles/${pkEditingId}`;
    try {
      const res = await fetch(url, { method: isCreate ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pkFormData) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setPkFormError(err.error || `Erreur serveur (${res.status})`); return; }
      closePkForm();
      fetchPk(pkSearch);
    } catch { setPkFormError("Impossible de joindre le serveur."); }
  };

  const handlePkDelete = async (id) => {
    try {
      const res = await fetch(`${BASE_URL}/stock-profiles/${id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setPkError(err.error || `Erreur serveur (${res.status})`); return; }
      fetchPk(pkSearch);
    } catch { setPkError("Impossible de joindre le serveur."); }
  };

  return (
    <div className="references-view">
      {/* ── Sélecteur client / catégorie ── */}
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
              onClick={() => switchClient(c)}
            />
          ))}
          <Button
            toggle
            type="button"
            active={isProfilsKits}
            color={isProfilsKits ? "purple" : undefined}
            icon="sliders horizontal"
            content="Profils & Kits"
            onClick={() => switchClient("PROFILS")}
          />
        </Button.Group>

        {/* ── Barre visuels ── */}
        {!isProfilsKits && (
          <>
            <Input
              icon="search"
              placeholder="Rechercher par référence ou modèle…"
              value={search}
              onChange={(e, v) => handleSearchChange(v.value)}
              className="references-search"
            />
            <Button primary type="button" icon="plus" content="Ajouter" onClick={openCreateForm} />
            <Button type="button" icon="sync" loading={checkLoading} disabled={checkLoading} content="Vérifier les références" onClick={runCheck} />
          </>
        )}

        {/* ── Barre profils & kits ── */}
        {isProfilsKits && (
          <>
            <Input
              icon="search"
              placeholder="Référence, libellé, code article…"
              value={pkSearch}
              onChange={(e, v) => handlePkSearchChange(v.value)}
              className="references-search"
            />
            <Button primary type="button" icon="plus" content="Ajouter" onClick={openPkCreateForm} />
            <span className="references-count">
              {pkLoading ? "Chargement…" : `${pkItems.length} article${pkItems.length !== 1 ? "s" : ""}`}
            </span>
          </>
        )}
      </div>

      {listError && <p className="references-error">{listError}</p>}
      {checkError && <p className="references-error">{checkError}</p>}
      {pkError && <p className="references-error">{pkError}</p>}

      {/* ── Formulaire création/édition visuel ── */}
      {!isProfilsKits && editingId && (
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
                  <Checkbox checked={formData.blanc} onChange={(e, v) => setFormData((d) => ({ ...d, blanc: v.checked }))} />
                </Form.Field>
              )}
            </Form.Group>
            {formError && <p className="references-error">{formError}</p>}
            <div className="references-form-actions">
              <Button basic type="button" onClick={closeForm}>Annuler</Button>
              <Button primary type="submit">{editingId === "new" ? "Créer" : "Enregistrer"}</Button>
            </div>
          </Form>
        </div>
      )}

      {/* ── Table visuels ── */}
      {!isProfilsKits && (
        <div className="references-table-wrapper">
          <Table compact celled sortable className="references-table">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell sorted={sorted("ref")} onClick={() => handleSort("ref")}>Référence</Table.HeaderCell>
                <Table.HeaderCell sorted={sorted("model")} onClick={() => handleSort("model")}>Modèle</Table.HeaderCell>
                <Table.HeaderCell sorted={sorted("finition")} onClick={() => handleSort("finition")}>Finition</Table.HeaderCell>
                <Table.HeaderCell sorted={sorted("format")} onClick={() => handleSort("format")}>Format</Table.HeaderCell>
                {client === "ECOM" && <Table.HeaderCell sorted={sorted("blanc")} onClick={() => handleSort("blanc")}>Blanc</Table.HeaderCell>}
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {!loading && sortedItems.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={client === "ECOM" ? 6 : 5}>Aucune référence trouvée.</Table.Cell>
                </Table.Row>
              )}
              {sortedItems.map((item) => (
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
                    <Button compact size="mini" color="red" icon="trash" onClick={() => setConfirmDeleteId(item._id)} title="Supprimer" />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {/* ── Formulaire création/édition profil & kit ── */}
      {isProfilsKits && pkEditingId && (
        <div className="references-form form-section--accented">
          <Form error={Boolean(pkFormError)} onSubmit={submitPkForm}>
            <Form.Group widths="equal">
              <Form.Field>
                <label>Référence</label>
                <Input value={pkFormData.ref} onChange={(e, v) => setPkFormData((d) => ({ ...d, ref: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Type</label>
                <Select options={TYPE_OPTIONS} value={pkFormData.type} onChange={(e, v) => setPkFormData((d) => ({ ...d, type: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Libellé</label>
                <Input value={pkFormData.libelle} onChange={(e, v) => setPkFormData((d) => ({ ...d, libelle: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Modèle</label>
                <Input value={pkFormData.modele} onChange={(e, v) => setPkFormData((d) => ({ ...d, modele: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Code article</label>
                <Input value={pkFormData.codeArticle} onChange={(e, v) => setPkFormData((d) => ({ ...d, codeArticle: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Famille</label>
                <Input value={pkFormData.famille} onChange={(e, v) => setPkFormData((d) => ({ ...d, famille: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Sous-famille</label>
                <Input value={pkFormData.sousFamille} onChange={(e, v) => setPkFormData((d) => ({ ...d, sousFamille: v.value }))} />
              </Form.Field>
              <Form.Field>
                <label>Stock dispo</label>
                <Input type="number" min="0" value={pkFormData.stockDisponible} onChange={(e, v) => setPkFormData((d) => ({ ...d, stockDisponible: v.value }))} />
              </Form.Field>
            </Form.Group>
            {pkFormError && <p className="references-error">{pkFormError}</p>}
            <div className="references-form-actions">
              <Button basic type="button" onClick={closePkForm}>Annuler</Button>
              <Button primary type="submit">{pkEditingId === "new" ? "Créer" : "Enregistrer"}</Button>
            </div>
          </Form>
        </div>
      )}

      {/* ── Table profils & kits ── */}
      {isProfilsKits && (
        <div className="references-table-wrapper">
          <Table compact celled sortable className="references-table">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell sorted={pkSorted("ref")} onClick={() => handlePkSort("ref")}>Référence</Table.HeaderCell>
                <Table.HeaderCell sorted={pkSorted("codeArticle")} onClick={() => handlePkSort("codeArticle")}>Code article</Table.HeaderCell>
                <Table.HeaderCell sorted={pkSorted("libelle")} onClick={() => handlePkSort("libelle")}>Libellé</Table.HeaderCell>
                <Table.HeaderCell sorted={pkSorted("modele")} onClick={() => handlePkSort("modele")}>Modèle</Table.HeaderCell>
                <Table.HeaderCell sorted={pkSorted("famille")} onClick={() => handlePkSort("famille")}>Famille</Table.HeaderCell>
                <Table.HeaderCell sorted={pkSorted("sousFamille")} onClick={() => handlePkSort("sousFamille")}>Sous-famille</Table.HeaderCell>
                <Table.HeaderCell sorted={pkSorted("stockDisponible")} onClick={() => handlePkSort("stockDisponible")}>Stock dispo</Table.HeaderCell>
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {!pkLoading && sortedPkItems.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={8}>Aucun article trouvé.</Table.Cell>
                </Table.Row>
              )}
              {sortedPkItems.map((item) => (
                <Table.Row key={item._id}>
                  <Table.Cell>{item.ref}</Table.Cell>
                  <Table.Cell>{item.codeArticle}</Table.Cell>
                  <Table.Cell>{item.libelle}</Table.Cell>
                  <Table.Cell>{item.modele}</Table.Cell>
                  <Table.Cell>{item.famille}</Table.Cell>
                  <Table.Cell>{item.sousFamille}</Table.Cell>
                  <Table.Cell>{item.stockDisponible ?? 0}</Table.Cell>
                  <Table.Cell>
                    <Button compact size="mini" icon="pencil" onClick={() => openPkEditForm(item)} title="Modifier" />
                    <Button compact size="mini" color="red" icon="trash" onClick={() => setPkConfirmDeleteId(item._id)} title="Supprimer" />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {/* ── Modals visuels ── */}
      <Modal open={previewItem !== null} onClose={closePreview} size="small" closeIcon>
        <Modal.Header>{previewItem?.model} — {previewItem?.ref}</Modal.Header>
        <Modal.Content image scrolling>
          {previewUrl
            ? <Image wrapped size="large" src={previewUrl} alt="Aperçu du visuel" />
            : <p>Aucun aperçu disponible pour cette référence.</p>}
        </Modal.Content>
      </Modal>

      <Modal open={checkModalOpen} onClose={() => setCheckModalOpen(false)} size="large" closeIcon scrolling>
        <Modal.Header>
          Rapport de vérification{checkReport?.scannedAt ? ` — ${new Date(checkReport.scannedAt).toLocaleString("fr-FR")}` : ""}
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
                <p>{r.stats?.filesScanned ?? 0} fichiers scannés · {r.stats?.refsInDb ?? 0} références en base</p>

                <div className="references-check-section">
                  <strong>Fichiers sans référence en base ({r.orphanFiles.length})</strong>
                  {r.orphanFiles.length === 0 ? <p>Aucun écart.</p> : (
                    <Table compact celled size="small">
                      <Table.Header><Table.Row><Table.HeaderCell>Fichier</Table.HeaderCell><Table.HeaderCell>Réf. extraite</Table.HeaderCell><Table.HeaderCell>Action</Table.HeaderCell></Table.Row></Table.Header>
                      <Table.Body>
                        {r.orphanFiles.map((o) => (
                          <Table.Row key={o.filePath}>
                            <Table.Cell>{o.fileName}</Table.Cell>
                            <Table.Cell>{o.ref || <em>non extraite</em>}</Table.Cell>
                            <Table.Cell><Button compact size="mini" primary disabled={!o.ref} content="Créer" onClick={() => createFromOrphan(o)} /></Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </div>

                <div className="references-check-section">
                  <strong>Références en base sans fichier ({r.missingFiles.length})</strong>
                  {r.missingFiles.length === 0 ? <p>Aucun écart.</p> : (
                    <Table compact celled size="small">
                      <Table.Header><Table.Row><Table.HeaderCell>Référence</Table.HeaderCell><Table.HeaderCell>Modèle</Table.HeaderCell><Table.HeaderCell>Format</Table.HeaderCell></Table.Row></Table.Header>
                      <Table.Body>
                        {r.missingFiles.map((m) => (
                          <Table.Row key={m.ref}><Table.Cell>{m.ref}</Table.Cell><Table.Cell>{m.model}</Table.Cell><Table.Cell>{m.format}</Table.Cell></Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </div>

                <div className="references-check-section">
                  <strong>Incohérences de format ({r.formatMismatches.length})</strong>
                  {r.formatMismatches.length === 0 ? <p>Aucun écart.</p> : (
                    <Table compact celled size="small">
                      <Table.Header><Table.Row><Table.HeaderCell>Référence</Table.HeaderCell><Table.HeaderCell>Fichier</Table.HeaderCell><Table.HeaderCell>Format fichier</Table.HeaderCell><Table.HeaderCell>Format base</Table.HeaderCell></Table.Row></Table.Header>
                      <Table.Body>
                        {r.formatMismatches.map((m) => (
                          <Table.Row key={`${m.ref}-${m.fileName}`}><Table.Cell>{m.ref}</Table.Cell><Table.Cell>{m.fileName}</Table.Cell><Table.Cell>{m.fileFormat}</Table.Cell><Table.Cell>{m.dbFormat}</Table.Cell></Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </div>

                <div className="references-check-section">
                  <strong>Références absentes de Gamesys ({r.gamesys?.notFoundInGamesys?.length ?? 0})</strong>
                  {r.gamesys?.unavailable
                    ? <p className="references-check-warning">Gamesys inaccessible — vérification ignorée.</p>
                    : !r.gamesys?.notFoundInGamesys?.length ? <p>Aucun écart.</p> : (
                      <Table compact celled size="small">
                        <Table.Header><Table.Row><Table.HeaderCell>Référence</Table.HeaderCell><Table.HeaderCell>Modèle</Table.HeaderCell></Table.Row></Table.Header>
                        <Table.Body>
                          {r.gamesys.notFoundInGamesys.map((m) => (
                            <Table.Row key={`gm-nf-${m.ref}`}><Table.Cell>{m.ref}</Table.Cell><Table.Cell>{m.model}</Table.Cell></Table.Row>
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
        onConfirm={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
      />

      <Confirm
        open={pkConfirmDeleteId !== null}
        header="Supprimer cet article ?"
        content="Cette action est irréversible."
        confirmButton="Supprimer"
        cancelButton="Annuler"
        onCancel={() => setPkConfirmDeleteId(null)}
        onConfirm={() => { handlePkDelete(pkConfirmDeleteId); setPkConfirmDeleteId(null); }}
      />
    </div>
  );
}

export default ReferencesView;
