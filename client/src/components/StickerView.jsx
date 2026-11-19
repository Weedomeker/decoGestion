import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Confirm, Form, Icon, Input, Message } from "semantic-ui-react";
import Dropdown from "./AutoDropdown";
import { API_BASE } from "../utils/api";
import StickerCanvas from "./sticker/StickerCanvas";
import StickerToolbar from "./sticker/StickerToolbar";
import StickerProperties from "./sticker/StickerProperties";
import StickerModeles from "./sticker/StickerModeles";
import useStickerEditor from "./sticker/useStickerEditor";

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

// Réponse d'erreur ({ error }) : liste vide, au lieu de garder les suggestions de la saisie précédente.
const toOpts = (arr) => (Array.isArray(arr) ? arr.map((v) => ({ key: v, value: v, text: v })) : []);

const lireJson = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur (${res.status})`);
  return data;
};

// ─── Sous-composants définis hors du composant principal ──────────────────────

function AutoField({ fieldKey, mongoField, label, placeholder, value, options, onSearch, onChange, onAddItem }) {
  const currentOpts =
    value && !options.some((o) => o.value === value) ? [{ key: value, value, text: value }, ...options] : options;

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

AutoField.propTypes = {
  fieldKey: PropTypes.string.isRequired,
  mongoField: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  value: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.object).isRequired,
  onSearch: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  onAddItem: PropTypes.func.isRequired,
};

function StickerPdfPanel({ pdfUrl, isLoading, error }) {
  if (isLoading) {
    return (
      <div className="sticker-preview-placeholder">
        <Icon name="spinner" loading size="large" />
        <span>Génération de l&apos;aperçu…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="sticker-preview-placeholder sticker-preview-placeholder--error">
        <Icon name="exclamation circle" size="large" />
        <span>{error}</span>
      </div>
    );
  }
  if (!pdfUrl) {
    return (
      <div className="sticker-preview-placeholder">
        <Icon name="file pdf outline" size="large" />
        <span>Cliquez sur « Aperçu PDF » pour voir l&apos;étiquette telle qu&apos;elle sera imprimée</span>
      </div>
    );
  }
  return <iframe src={pdfUrl} title="Aperçu du sticker" className="sticker-pdf-iframe" />;
}

StickerPdfPanel.propTypes = {
  pdfUrl: PropTypes.string,
  isLoading: PropTypes.bool,
  error: PropTypes.string,
};

// ─── Composant principal ──────────────────────────────────────────────────────

function StickerView() {
  const [fields, setFields] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [vue, setVue] = useState("editeur");

  // numCmd typeahead
  const [numCmdSuggestions, setNumCmdSuggestions] = useState([]);
  const [showNumCmdList, setShowNumCmdList] = useState(false);

  // Options des Dropdowns
  const [opts, setOpts] = useState({ ville: [], ref: [], visuel: [], format_visu: [] });
  const [refFormats, setRefFormats] = useState([]);

  // Éditeur d'étiquette
  const editeur = useStickerEditor();
  const [modeles, setModeles] = useState([]);
  const [modeleId, setModeleId] = useState(null);
  const [bibliotheque, setBibliotheque] = useState({ pictos: [], jetons: [] });
  const [images, setImages] = useState([]);
  const [donnees, setDonnees] = useState({});
  const [modeleEnCours, setModeleEnCours] = useState(false);
  const [importEnCours, setImportEnCours] = useState(false);
  const [messageModele, setMessageModele] = useState(null);
  // Image imposée pour la miniature de cette étiquette : { type: "apercu", fichier, url } | { type: "fichier", nom, url }
  const [miniatureForcee, setMiniatureForcee] = useState(null);
  const donneesAffichees = useMemo(
    () => (miniatureForcee ? { ...donnees, miniatureUrl: miniatureForcee.url } : donnees),
    [donnees, miniatureForcee],
  );
  const corpsMiniature = () =>
    miniatureForcee?.type === "apercu"
      ? { apercu: miniatureForcee.fichier }
      : miniatureForcee?.type === "fichier"
        ? { miniatureDataUrl: miniatureForcee.url }
        : {};
  const [origineNouveau, setOrigineNouveau] = useState(null); // nom du modèle copié, pour « Enregistrer sous… »
  const [modeleEnAttente, setModeleEnAttente] = useState(null); // choix en attente de confirmation

  const pictosParCle = useMemo(
    () => Object.fromEntries(bibliotheque.pictos.map((p) => [p.cle, p])),
    [bibliotheque.pictos],
  );

  useEffect(() => {
    fetch(`${API_BASE}/ref_formats`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setRefFormats(data))
      .catch(() => {});
    fetch(`${API_BASE}/sticker_pictos`)
      .then(lireJson)
      .then((data) => setBibliotheque({ pictos: data.pictos || [], jetons: data.jetons || [] }))
      .catch(() => {});
    fetch(`${API_BASE}/sticker_images`)
      .then(lireJson)
      .then((data) => Array.isArray(data) && setImages(data))
      .catch(() => {});
  }, []);

  const chargerModele = useCallback(
    (modele) => {
      setModeleId(modele?._id || null);
      editeur.charger(modele?.elements || []);
    },
    [editeur.charger], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const defautPour = (liste, client) =>
    liste.find((m) => m.client === client && m.parDefaut) || liste.find((m) => m.parDefaut) || liste[0];

  const rechargerModeles = useCallback(async () => {
    const data = await fetch(`${API_BASE}/sticker_modeles`).then(lireJson);
    const liste = Array.isArray(data) ? data : [];
    setModeles(liste);
    return liste;
  }, []);

  useEffect(() => {
    rechargerModeles()
      .then((liste) => chargerModele(defautPour(liste, "LM")))
      .catch(() => setMessageModele({ negatif: true, texte: "Modèles d'étiquette indisponibles (MongoDB ?)" }));
  }, [rechargerModeles, chargerModele]);

  // Changement d'enseigne : son modèle par défaut, sauf modifications en cours.
  const clientPrecedent = useRef(fields.client);
  useEffect(() => {
    if (fields.client === clientPrecedent.current) return;
    clientPrecedent.current = fields.client;
    if (!fields.client || editeur.modifie || modeles.length === 0) return;
    const courant = modeles.find((m) => m._id === modeleId);
    if (courant && courant.client === fields.client) return;
    chargerModele(defautPour(modeles, fields.client));
  }, [fields.client, editeur.modifie, modeles, modeleId, chargerModele]);

  // Valeurs des champs automatiques ({numEx}, {infos}…) et miniature, calculées par le serveur.
  const majDonnees = useMemo(
    () =>
      debounce(async (f) => {
        try {
          const res = await fetch(`${API_BASE}/sticker_donnees`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(f),
          });
          setDonnees(await lireJson(res));
        } catch {
          /* aperçu sans données : les jetons restent affichés */
        }
      }, 300),
    [],
  );
  useEffect(() => {
    majDonnees(fields);
  }, [fields, majDonnees]);

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

  const fetchPreview = async () => {
    setPreviewError(null);
    setPreviewLoading(true);
    setVue("pdf");
    try {
      const response = await fetch(`${API_BASE}/preview_sticker_quick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, elements: editeur.elements, ...corpsMiniature() }),
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
  };

  const searchNumCmd = useMemo(
    () =>
      debounce(async (q) => {
        if (!q || q.length < 2) {
          setNumCmdSuggestions([]);
          setShowNumCmdList(false);
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/history?q=${encodeURIComponent(q)}&limit=6`);
          const data = await res.json();
          // Un panneau par entrée : deux lignes identiques (même visuel, même format) n'en font qu'une.
          const vus = new Set();
          const uniques = (data.data || []).filter((e) => {
            const cle = [e.numCmd, e.deco, e.format, e.ref].join("|");
            if (vus.has(cle)) return false;
            vus.add(cle);
            return true;
          });
          setNumCmdSuggestions(uniques);
          setShowNumCmdList(true);
        } catch {
          /* silent */
        }
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

  const fetchSuggestions = useMemo(
    () =>
      debounce(async (fieldKey, mongoField, q) => {
        if (!q) {
          setOpts((prev) => ({ ...prev, [fieldKey]: [] }));
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/suggestions?field=${mongoField}&q=${encodeURIComponent(q)}`);
          const data = await res.json();
          setOpts((prev) => ({ ...prev, [fieldKey]: toOpts(data) }));
        } catch {
          /* silent */
        }
      }, 250),
    [],
  );

  const clientRef = useRef(fields.client);
  clientRef.current = fields.client;
  const fetchRefVisuels = useMemo(
    () =>
      debounce(async (fieldKey, _mongoField, q) => {
        if (!q || q.length < 2) {
          setOpts((prev) => ({ ...prev, [fieldKey]: [] }));
          return;
        }
        try {
          const params = new URLSearchParams({ q });
          if (clientRef.current) params.set("client", clientRef.current);
          const res = await fetch(`${API_BASE}/ref_visuels?${params}`);
          const data = await res.json();
          setOpts((prev) => ({ ...prev, [fieldKey]: toOpts(data) }));
        } catch {
          /* silent */
        }
      }, 250),
    [],
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
    } catch {
      /* silent */
    }
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
        body: JSON.stringify({ ...fields, elements: editeur.elements, ...corpsMiniature() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || `Erreur (${response.status})`);
      } else {
        setSuccess(result.message || "Sticker généré avec succès !");
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMiniatureForcee(null);
    setFields(INITIAL);
    setOpts({ ville: [], ref: [], visuel: [], format_visu: [] });
    setSuccess(null);
    setError(null);
    setPdfBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
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

  // ── Modèles ──

  const executerModele = async (action, succes) => {
    setModeleEnCours(true);
    setMessageModele(null);
    try {
      const resultat = await action();
      if (succes) setMessageModele({ texte: succes });
      return resultat;
    } catch (err) {
      setMessageModele({ negatif: true, texte: err.message });
      return null;
    } finally {
      setModeleEnCours(false);
    }
  };

  // Étiquette neuve, pas encore en base : vierge, ou copie du modèle par défaut de l'enseigne.
  // Les éléments copiés reçoivent de nouveaux id ; « Enregistrer sous… » la sauvegarde.
  const ouvrirNouveau = (depart) => {
    const source = depart === "vierge" ? null : defautPour(modeles, fields.client || "LM");
    setModeleId(null);
    setOrigineNouveau(source?.nom || null);
    editeur.charger(
      (source?.elements || []).map((e, i) => ({ ...e, id: `${e.id || "e"}_${Date.now().toString(36)}${i}` })),
      true,
    );
    setVue("editeur");
    setMessageModele({
      texte: source
        ? `Nouvelle étiquette copiée de « ${source.nom} » : « Enregistrer sous… » pour la garder`
        : "Étiquette vierge : « Enregistrer sous… » pour la garder",
    });
  };

  // En attente de confirmation : { id } (autre modèle) ou { nouveau: "vierge" | "enseigne" }
  const appliquerChoix = (choix) => {
    if (choix.nouveau) ouvrirNouveau(choix.nouveau);
    else chargerModele(modeles.find((m) => m._id === choix.id));
  };

  const demanderChoix = (choix) => {
    if (editeur.modifie) setModeleEnAttente(choix);
    else appliquerChoix(choix);
  };

  const choisirModele = (id) => {
    if (id === modeleId) return;
    demanderChoix({ id });
  };

  const enregistrer = () =>
    executerModele(async () => {
      const res = await fetch(`${API_BASE}/sticker_modeles/${modeleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements: editeur.elements }),
      });
      await lireJson(res);
      editeur.marquerEnregistre();
      await rechargerModeles();
    }, "Modèle enregistré");

  const enregistrerSous = (nom, client) =>
    executerModele(async () => {
      const res = await fetch(`${API_BASE}/sticker_modeles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, client, elements: editeur.elements }),
      });
      const cree = await lireJson(res);
      await rechargerModeles();
      setModeleId(cree._id);
      editeur.marquerEnregistre();
      return true;
    }, `Modèle « ${nom} » créé`);

  const definirDefaut = () =>
    executerModele(async () => {
      const res = await fetch(`${API_BASE}/sticker_modeles/${modeleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parDefaut: true }),
      });
      await lireJson(res);
      await rechargerModeles();
    }, "Modèle utilisé désormais pour les étiquettes des jobs de cette enseigne");

  const supprimerModele = () =>
    executerModele(async () => {
      const res = await fetch(`${API_BASE}/sticker_modeles/${modeleId}`, { method: "DELETE" });
      await lireJson(res);
      const liste = await rechargerModeles();
      chargerModele(defautPour(liste, fields.client || "LM"));
    }, "Modèle supprimé");

  const importerImage = async (fichier) => {
    if (fichier.size > 2 * 1024 * 1024) {
      setMessageModele({ negatif: true, texte: "Image trop lourde (2 Mo maximum)" });
      return null;
    }
    setImportEnCours(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resolve(lecteur.result);
        lecteur.onerror = reject;
        lecteur.readAsDataURL(fichier);
      });
      const res = await fetch(`${API_BASE}/sticker_images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: fichier.name.replace(/\.[^.]+$/, ""), dataUrl }),
      });
      const img = await lireJson(res);
      setImages((prev) => [img, ...prev]);
      return img;
    } catch (err) {
      setMessageModele({ negatif: true, texte: err.message || "Import impossible" });
      return null;
    } finally {
      setImportEnCours(false);
    }
  };

  // Raccourcis clavier de l'éditeur (hors saisie dans un champ).
  const { selection, elementSelectionne } = editeur;
  useEffect(() => {
    if (vue !== "editeur") return undefined;
    const surTouche = (ev) => {
      const cible = ev.target;
      if (cible.closest?.("input, textarea, select, [contenteditable=true], .ui.modal")) return;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) editeur.retablir();
        else editeur.annuler();
      } else if (ctrl && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        editeur.retablir();
      } else if (ctrl && ev.key.toLowerCase() === "d" && selection) {
        ev.preventDefault();
        editeur.dupliquer(selection);
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && selection) {
        ev.preventDefault();
        editeur.supprimer(selection);
      } else if (ev.key === "Escape") {
        editeur.selectionner(null);
      } else if (ev.key.startsWith("Arrow") && elementSelectionne && !elementSelectionne.verrou) {
        ev.preventDefault();
        const pas = ev.shiftKey ? 5 : 0.5;
        const dx = ev.key === "ArrowLeft" ? -pas : ev.key === "ArrowRight" ? pas : 0;
        const dy = ev.key === "ArrowUp" ? -pas : ev.key === "ArrowDown" ? pas : 0;
        editeur.modifier(elementSelectionne.id, { x: elementSelectionne.x + dx, y: elementSelectionne.y + dy });
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [vue, selection, elementSelectionne, editeur]);

  return (
    <div className="sticker-view">
      <div className="sk-layout">
        {/* ── Formulaire ── */}
        <aside className="sk-colonne sk-colonne--form">
          <Form onSubmit={handleSubmit} className="sticker-form">
            {/* Toggle Stock en tête — conditionne toute la saisie */}
            <div className="sticker-stock-row">
              <Checkbox label="Article en stock" checked={fields.isStock} toggle onChange={handleStockToggle} />
              {fields.isStock && <span className="sticker-stock-hint">Sans n° de dossier</span>}
            </div>

            <Form.Group widths="equal">
              <Form.Field required>
                <label>Client</label>
                <Dropdown
                  selection
                  fluid
                  placeholder="Client"
                  options={CLIENT_OPTIONS}
                  value={fields.client}
                  onChange={(_, d) => set("client", d.value)}
                />
              </Form.Field>
              <Form.Field>
                <label>Exemplaires</label>
                <Input fluid type="number" placeholder="1" value={fields.ex} min={1} onChange={(e) => set("ex", e.target.value)} />
              </Form.Field>
            </Form.Group>

            {!fields.isStock && (
              <Form.Field required>
                <label>N° Commande</label>
                <div className="sticker-numcmd-wrapper">
                  <Input
                    fluid
                    type="text"
                    inputMode="numeric"
                    placeholder="Ex : 169580"
                    value={fields.numCmd}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      set("numCmd", v);
                      searchNumCmd(v);
                    }}
                    onBlur={() => setTimeout(() => setShowNumCmdList(false), 180)}
                    onFocus={() => numCmdSuggestions.length > 0 && setShowNumCmdList(true)}
                  />
                  {showNumCmdList && numCmdSuggestions.length > 0 && (
                    <div className="sticker-suggestions-list">
                      {numCmdSuggestions.map((entry) => (
                        <div key={entry._id} className="sticker-suggestion-item" onMouseDown={() => selectNumCmd(entry)}>
                          <span className="sticker-suggestion-cmd">{entry.numCmd}</span>
                          <span className="sticker-suggestion-meta">
                            {[entry.mag, entry.client, entry.deco, entry.format].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Form.Field>
            )}

            <AutoField
              fieldKey="ville"
              mongoField="ville"
              label="Ville"
              placeholder="Ex : PARIS"
              value={fields.ville}
              options={opts.ville}
              onSearch={fetchSuggestions}
              onChange={handleFieldChange}
              onAddItem={handleAddItem}
            />
            <AutoField
              fieldKey="visuel"
              mongoField="visuel"
              label="Visuel"
              placeholder="Ex : JARDIN SECRET MAT"
              value={fields.visuel}
              options={opts.visuel}
              onSearch={fetchRefVisuels}
              onChange={handleFieldChange}
              onAddItem={handleAddItem}
            />
            <Form.Group widths="equal">
              <Form.Field>
                <label>Format</label>
                <Dropdown
                  search
                  selection
                  allowAdditions
                  fluid
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
              <AutoField
                fieldKey="ref"
                mongoField="ref"
                label="Référence"
                placeholder="Ex : 3612345678901"
                value={fields.ref}
                options={opts.ref}
                onSearch={fetchSuggestions}
                onChange={handleFieldChange}
                onAddItem={handleAddItem}
              />
            </Form.Group>

            {success && (
              <Message positive size="small">
                <Icon name="check circle" /> {success}
              </Message>
            )}
            {error && (
              <Message negative size="small">
                <Icon name="exclamation circle" /> {error}
              </Message>
            )}

            <div className="sticker-form-actions">
              <Button
                type="button"
                icon="file pdf outline"
                content="Aperçu PDF"
                onClick={fetchPreview}
                loading={previewLoading}
                disabled={previewLoading || !canPreview}
              />
              <Button type="submit" primary icon="tag" content="Générer" loading={loading} disabled={loading || !canPreview} />
              <Button
                type="button"
                basic
                icon="refresh"
                title="Vider le formulaire"
                aria-label="Vider le formulaire"
                onClick={handleReset}
                disabled={loading || previewLoading}
              />
            </div>
          </Form>
        </aside>

        {/* ── Éditeur ── */}
        <section className="sk-colonne sk-colonne--editeur">
          <StickerModeles
            modeles={modeles}
            modeleId={modeleId}
            client={fields.client}
            modifie={editeur.modifie}
            enCours={modeleEnCours}
            onChoisir={choisirModele}
            onNouveau={(depart) => demanderChoix({ nouveau: depart })}
            nomSuggere={origineNouveau ? `${origineNouveau} (copie)` : ""}
            onEnregistrer={enregistrer}
            onEnregistrerSous={enregistrerSous}
            onDefinirDefaut={definirDefaut}
            onSupprimer={supprimerModele}
          />
          {messageModele && (
            <Message
              size="mini"
              negative={messageModele.negatif}
              positive={!messageModele.negatif}
              onDismiss={() => setMessageModele(null)}
              content={messageModele.texte}
            />
          )}
          <StickerToolbar
            pictos={bibliotheque.pictos}
            jetons={bibliotheque.jetons}
            images={images}
            onAjouter={(el) => {
              editeur.ajouter(el);
              setVue("editeur");
            }}
            onImporterImage={importerImage}
            importEnCours={importEnCours}
            selection={selection}
            onDupliquer={() => editeur.dupliquer(selection)}
            onPlan={(sens) => editeur.deplacerPlan(selection, sens)}
            onSupprimer={() => editeur.supprimer(selection)}
            onAnnuler={editeur.annuler}
            onRetablir={editeur.retablir}
            peutAnnuler={editeur.peutAnnuler}
            peutRetablir={editeur.peutRetablir}
          />
          <div className="sk-onglets" role="tablist">
            <button type="button" role="tab" aria-selected={vue === "editeur"} className={vue === "editeur" ? "is-actif" : ""} onClick={() => setVue("editeur")}>
              <Icon name="edit outline" /> Éditeur
            </button>
            <button type="button" role="tab" aria-selected={vue === "pdf"} className={vue === "pdf" ? "is-actif" : ""} onClick={() => setVue("pdf")}>
              <Icon name="file pdf outline" /> Aperçu PDF
            </button>
            <span className="sk-onglets__info">A6 · 105 × 148 mm</span>
          </div>
          <div className="sk-scene">
            {vue === "editeur" ? (
              <StickerCanvas
                elements={editeur.elements}
                selection={selection}
                onSelect={editeur.selectionner}
                onModifier={editeur.modifier}
                onMemoriser={editeur.memoriser}
                pictos={pictosParCle}
                donnees={donneesAffichees}
              />
            ) : (
              <StickerPdfPanel pdfUrl={pdfBlobUrl} isLoading={previewLoading} error={previewError} />
            )}
          </div>
        </section>

        <Confirm
          open={Boolean(modeleEnAttente)}
          size="tiny"
          header="Modifications non enregistrées"
          content={
            modeleEnAttente?.nouveau
              ? "Ouvrir une nouvelle étiquette abandonne les modifications en cours."
              : "Changer de modèle abandonne les modifications en cours de l'étiquette."
          }
          cancelButton="Garder mes modifications"
          confirmButton="Abandonner"
          onCancel={() => setModeleEnAttente(null)}
          onConfirm={() => {
            appliquerChoix(modeleEnAttente);
            setModeleEnAttente(null);
          }}
        />

        {/* ── Propriétés ── */}
        <aside className="sk-colonne sk-colonne--props">
          <StickerProperties
            element={elementSelectionne}
            onModifier={editeur.modifier}
            pictos={bibliotheque.pictos}
            images={images}
            jetons={bibliotheque.jetons}
            miniatureForcee={miniatureForcee}
            onMiniatureForcee={setMiniatureForcee}
            miniatureUrlAuto={donnees.miniatureUrl || undefined}
          />
        </aside>
      </div>
    </div>
  );
}

export default StickerView;
