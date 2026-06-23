import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Dropdown, Form, Icon, Input, Message } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

const CLIENT_OPTIONS = [
  { key: "LM", value: "LM", text: "LM" },
  { key: "CASTO", value: "CASTO", text: "CASTO" },
  { key: "BRICO", value: "BRICO", text: "BRICO" },
  { key: "ECOM", value: "ECOM", text: "ECOM" },
];


const INITIAL = {
  client: "",
  numCmd: "",
  ex: "1",
  ville: "",
  ref: "",
  visuel: "",
  format_visu: "",
  isStock: false,
};

const toOpts = (arr) => arr.map((v) => ({ key: v, value: v, text: v }));

// ─── Sous-composants définis hors du composant principal ──────────────────────

function AutoField({ fieldKey, mongoField, label, placeholder, value, options, onSearch, onChange, onAddItem }) {
  const currentOpts =
    value && !options.some((o) => o.value === value)
      ? [{ key: value, value, text: value }, ...options]
      : options;

  return (
    <Form.Field>
      <label>{label}</label>
      <Dropdown
        search
        selection
        allowAdditions
        fluid
        placeholder={placeholder}
        options={currentOpts}
        value={value}
        onSearchChange={(_, { searchQuery }) => onSearch(fieldKey, mongoField, searchQuery)}
        onChange={(_, { value: v }) => onChange(fieldKey, v)}
        onAddItem={(_, { value: v }) => onAddItem(fieldKey, v)}
        noResultsMessage="Aucune suggestion"
        additionLabel="Nouveau : "
      />
    </Form.Field>
  );
}

function StickerPdfPanel({ pdfUrl, isLoading, error }) {
  if (isLoading) {
    return (
      <div className="sticker-preview-panel">
        <div className="sticker-preview-placeholder">
          <Icon name="spinner" loading size="large" />
          <span>Génération de l&apos;aperçu…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sticker-preview-panel">
        <div className="sticker-preview-placeholder sticker-preview-placeholder--error">
          <Icon name="exclamation circle" size="large" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="sticker-preview-panel">
        <div className="sticker-preview-placeholder">
          <Icon name="file pdf outline" size="large" />
          <span>Cliquez sur « Aperçu » pour visualiser le sticker</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sticker-preview-panel">
      <iframe
        src={pdfUrl}
        title="Aperçu du sticker"
        className="sticker-pdf-iframe"
      />
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

function StickerView() {
  const [fields, setFields] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

  // numCmd typeahead
  const [numCmdSuggestions, setNumCmdSuggestions] = useState([]);
  const [showNumCmdList, setShowNumCmdList] = useState(false);

  // Options des Dropdowns
  const [opts, setOpts] = useState({ ville: [], ref: [], visuel: [], format_visu: [] });
  const [refFormats, setRefFormats] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/ref_formats`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setRefFormats(data))
      .catch(() => {});
  }, []);

  const set = (key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
    setError(null);
  };

  const setAll = (partial) => {
    setFields((prev) => ({ ...prev, ...partial }));
    setOpts((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(partial)) {
        if (k in next && v && !next[k].some((o) => o.value === v)) {
          next[k] = [{ key: v, value: v, text: v }, ...next[k]];
        }
      }
      return next;
    });
    setSuccess(null);
    setError(null);
  };

  const fetchPreview = useCallback(async (currentFields) => {
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const response = await fetch(`${API_BASE}/preview_sticker_quick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentFields),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setPreviewError(result.error || "Erreur aperçu");
        return;
      }
      const blob = await response.blob();
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      setPreviewError("Impossible de générer l'aperçu.");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const searchNumCmd = useCallback(
    debounce(async (q) => {
      if (!q || q.length < 2) {
        setNumCmdSuggestions([]);
        setShowNumCmdList(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/history?q=${encodeURIComponent(q)}&limit=6`);
        const data = await res.json();
        setNumCmdSuggestions(data.data || []);
        setShowNumCmdList(true);
      } catch { /* silent */ }
    }, 280),
    [],
  );

  const selectNumCmd = (entry) => {
    setAll({
      numCmd: String(entry.numCmd),
      client: entry.client || fields.client,
      ville: entry.mag || fields.ville,
      ref: entry.ref || fields.ref,
      visuel: entry.deco || fields.visuel,
      format_visu: entry.format || fields.format_visu,
      ex: entry.ex != null ? String(entry.ex) : fields.ex,
    });
    setShowNumCmdList(false);
    setNumCmdSuggestions([]);
  };

  const fetchSuggestions = useCallback(
    debounce(async (fieldKey, mongoField, q) => {
      if (!q) {
        setOpts((prev) => ({ ...prev, [fieldKey]: [] }));
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/suggestions?field=${mongoField}&q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        setOpts((prev) => ({ ...prev, [fieldKey]: toOpts(data) }));
      } catch { /* silent */ }
    }, 250),
    [],
  );

  const fetchRefVisuels = useCallback(
    debounce(async (fieldKey, _mongoField, q) => {
      if (!q || q.length < 2) {
        setOpts((prev) => ({ ...prev, [fieldKey]: [] }));
        return;
      }
      try {
        const params = new URLSearchParams({ q });
        if (fields.client) params.set("client", fields.client);
        const res = await fetch(`${API_BASE}/ref_visuels?${params}`);
        const data = await res.json();
        setOpts((prev) => ({ ...prev, [fieldKey]: toOpts(data) }));
      } catch { /* silent */ }
    }, 250),
    [fields.client],
  );

  const handleAddItem = (fieldKey, value) => {
    setOpts((prev) => ({
      ...prev,
      [fieldKey]: [{ key: value, value, text: value }, ...prev[fieldKey]],
    }));
    set(fieldKey, value);
  };

  const lookupRef = useCallback(async (visuel, format) => {
    if (!visuel || !format) return;
    try {
      const params = new URLSearchParams({ visuel, format });
      const res = await fetch(`${API_BASE}/lookup_visuel?${params}`);
      const data = await res.json();
      if (!data.ref) return;
      setFields((prev) => ({ ...prev, ref: data.ref }));
      setOpts((prev) => {
        const refOpt = { key: data.ref, value: data.ref, text: data.ref };
        const already = prev.ref.some((o) => o.value === data.ref);
        return already ? prev : { ...prev, ref: [refOpt, ...prev.ref] };
      });
    } catch { /* silent */ }
  }, []);

  const handleFieldChange = (fieldKey, value) => {
    set(fieldKey, value);
    // Déclencher le lookup dès que visuel ET format sont connus
    if (fieldKey === "visuel" || fieldKey === "format_visu") {
      const visuel = fieldKey === "visuel" ? value : fields.visuel;
      const format = fieldKey === "format_visu" ? value : fields.format_visu;
      lookupRef(visuel, format);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/generate_sticker_quick`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || `Erreur (${response.status})`);
      } else {
        setSuccess(result.message || "Sticker généré avec succès !");
        fetchPreview(fields);
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFields(INITIAL);
    setOpts({ ville: [], ref: [], visuel: [], format_visu: [] });
    setSuccess(null);
    setError(null);
    setPdfBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPreviewError(null);
  };

  const canPreview = !!(fields.client && (fields.numCmd || fields.isStock));

  const handleStockToggle = (_, d) => {
    setFields((prev) => ({ ...prev, isStock: d.checked, numCmd: d.checked ? "" : prev.numCmd }));
    setSuccess(null);
    setError(null);
    if (d.checked) {
      setNumCmdSuggestions([]);
      setShowNumCmdList(false);
    }
  };

  return (
    <div className="sticker-view">
      <div className="sticker-view-inner">

        {/* ── Formulaire ── */}
        <div className="sticker-form-wrapper">

          <Form onSubmit={handleSubmit} className="sticker-form">

            {/* Toggle Stock en tête — conditionne toute la saisie */}
            <div className="sticker-stock-row">
              <Checkbox label="Article en stock" checked={fields.isStock} toggle
                onChange={handleStockToggle} />
              {fields.isStock && (
                <span className="sticker-stock-hint">Aucun numéro de dossier requis</span>
              )}
            </div>

            {/* Ligne 1 : Client / N° Commande / Exemplaires */}
            <Form.Group>
              <Form.Field required width={fields.isStock ? 8 : 4}>
                <label>Client</label>
                <Dropdown
                  selection fluid
                  placeholder="Client"
                  options={CLIENT_OPTIONS}
                  value={fields.client}
                  onChange={(_, d) => set("client", d.value)}
                />
              </Form.Field>

              {!fields.isStock ? (
                <Form.Field required width={8}>
                  <label>N° Commande</label>
                  <div className="sticker-numcmd-wrapper">
                    <Input
                      fluid type="number" placeholder="Ex : 12345"
                      value={fields.numCmd} min={1}
                      onChange={(e) => { set("numCmd", e.target.value); searchNumCmd(e.target.value); }}
                      onBlur={() => setTimeout(() => setShowNumCmdList(false), 180)}
                      onFocus={() => numCmdSuggestions.length > 0 && setShowNumCmdList(true)}
                    />
                    {showNumCmdList && numCmdSuggestions.length > 0 && (
                      <div className="sticker-suggestions-list">
                        {numCmdSuggestions.map((entry) => (
                          <div key={entry._id} className="sticker-suggestion-item" onMouseDown={() => selectNumCmd(entry)}>
                            <span className="sticker-suggestion-cmd">{entry.numCmd}</span>
                            <span className="sticker-suggestion-meta">
                              {entry.mag} · {entry.client}{entry.deco ? ` · ${entry.deco}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Form.Field>
              ) : null}

              <Form.Field width={fields.isStock ? 8 : 4}>
                <label>Exemplaires</label>
                <Input fluid type="number" placeholder="1" value={fields.ex} min={1}
                  onChange={(e) => set("ex", e.target.value)} />
              </Form.Field>
            </Form.Group>

            {/* Ligne 2 : Ville + Référence */}
            <Form.Group widths="equal">
              <AutoField fieldKey="ville" mongoField="ville" label="Ville" placeholder="Ex : PARIS"
                value={fields.ville} options={opts.ville}
                onSearch={fetchSuggestions} onChange={handleFieldChange} onAddItem={handleAddItem} />
              <AutoField fieldKey="ref" mongoField="ref" label="Référence" placeholder="Ex : 3612345678901"
                value={fields.ref} options={opts.ref}
                onSearch={fetchSuggestions} onChange={handleFieldChange} onAddItem={handleAddItem} />
            </Form.Group>

            {/* Ligne 3 : Visuel + Format */}
            <Form.Group widths="equal">
              <AutoField fieldKey="visuel" mongoField="visuel" label="Visuel" placeholder="Ex : MON_VISUEL BRILLANT gauche.pdf"
                value={fields.visuel} options={opts.visuel}
                onSearch={fetchRefVisuels} onChange={handleFieldChange} onAddItem={handleAddItem} />
              <Form.Field>
                <label>Format</label>
                <Dropdown
                  search selection allowAdditions fluid
                  placeholder="Ex : 150x100"
                  options={(() => {
                    const baseOpts = refFormats.map((f) => ({ key: f, value: f, text: f }));
                    if (fields.format_visu && !refFormats.includes(fields.format_visu)) {
                      return [{ key: fields.format_visu, value: fields.format_visu, text: fields.format_visu }, ...baseOpts];
                    }
                    return baseOpts;
                  })()}
                  value={fields.format_visu}
                  onChange={(_, { value: v }) => handleFieldChange("format_visu", v)}
                  onAddItem={(_, { value: v }) => handleFieldChange("format_visu", v)}
                  noResultsMessage="Aucun format de référence trouvé"
                  additionLabel="Personnalisé : "
                />
              </Form.Field>
            </Form.Group>

            {success && <Message positive><Icon name="check circle" /> {success}</Message>}
            {error && <Message negative><Icon name="exclamation circle" /> {error}</Message>}

            <div className="sticker-form-actions">
              <Button type="button" icon="eye" content="Aperçu"
                onClick={() => fetchPreview(fields)}
                loading={previewLoading} disabled={previewLoading || !canPreview} />
              <Button type="submit" primary icon="tag" content="Générer"
                loading={loading} disabled={loading || !canPreview} />
              <Button type="button" basic icon="refresh"
                onClick={handleReset} disabled={loading || previewLoading} />
            </div>
          </Form>
        </div>

        {/* ── Panneau aperçu PDF ── */}
        <div className="sticker-preview-column">
          <span className="sticker-preview-label">Aperçu</span>
          <StickerPdfPanel pdfUrl={pdfBlobUrl} isLoading={previewLoading} error={previewError} />
        </div>
      </div>
    </div>
  );
}

export default StickerView;
