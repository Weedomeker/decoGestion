import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { Button, Icon, Input, Label, Message, Segment } from "semantic-ui-react";
import { isCredenceFormat } from "../utils/credence";
import { API_BASE } from "../utils/api";
import { isDefinitelyWrongClient } from "../utils/referenceValidation";

const CLIENTS = ["LM", "CASTO", "ECOM", "BRICO"];
const CLIENT_ALIASES = {
  LM: ["leroy", "leroy merlin", "lm", "leroymerlin"],
  CASTO: ["casto", "castorama", "cas"],
  ECOM: ["ecom", "e commerce", "e-commerce"],
  BRICO: ["brico", "bricolage", "brico depot", "bricodepot", "bm"],
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function findKnownClient(client) {
  const normalized = normalizeText(client);
  return CLIENTS.find((value) => CLIENT_ALIASES[value].some((alias) => normalized.includes(alias)));
}

function formatToken(format) {
  return String(format || "").toLowerCase();
}

function findFormatFolder(folders, format) {
  const token = formatToken(format);
  if (!token) return null;
  return folders.find((folder) => normalizeText(`${folder?.name} ${folder?.path}`).includes(token)) || null;
}

function findFormatTauro(formatTauro, format) {
  const token = formatToken(format);
  if (!token) return "";
  return formatTauro.find((value) => normalizeText(value).includes(token)) || "";
}

// Vérifie si une référence apparaît dans un nom de fichier.
// Compare d'abord tel quel (après normalisation), puis avec séparateurs effacés
// pour gérer ALOHAD-150210 vs ALOHAD_150210 ou LM92938901 vs LM-92938901.
function referenceMatchesName(ref, filename) {
  if (!ref || !filename) return false;
  const r = normalizeText(ref);
  const n = normalizeText(filename);
  if (n.includes(r)) return true;
  const rs = r.replace(/[-_.\s]/g, "");
  return rs.length >= 4 && n.replace(/[-_.\s]/g, "").includes(rs);
}

// Le matching ne se base QUE sur les références produit Gamesys (reference,
// codeTarif, modele, articleReference) — jamais sur le libellé ou le format
// présents dans le nom de fichier, pour éviter qu'un fichier mal classé ou
// une coïncidence de mots ne gagne un fichier sans lien réel avec le visuel.
function scoreFile(file, job, client) {
  const rawName = (file?.name || "").split(/[\\/]/).pop();
  if (isDefinitelyWrongClient(rawName, client)) return -Infinity;

  let score = 0;
  if (referenceMatchesName(job.reference, file?.name)) score += 1000;
  if (referenceMatchesName(job.codeTarif, file?.name)) score += 900;
  if (referenceMatchesName(job.modele, file?.name)) score += 850;
  if (referenceMatchesName(job.articleReference, file?.name)) score += 800;

  return score;
}

function findFileCandidates(files, job, client) {
  return files
    .map((file) => ({ ...file, score: scoreFile(file, job, client) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

const REGEX_BLANC = /\+\s*blanc\b/i;

const TEINTE_MASSE_OPTIONS = [
  "NOIR ZERO MAT",
  "BLANC ZERO MAT",
  "GRANIT 3 MAT",
  "ALU BROSSE",
  "BRONZE BROSSE",
  "CUIVRE BROSSE",
  "NOIR BROSSE",
  "OR BROSSE",
];

function detectTeinteMasse(job) {
  // Pad with spaces for word-boundary matching (ex: "DECOR BROSSE" ne matche pas "OR BROSSE")
  const text = ` ${normalizeText(`${job.libelle || ""} ${job.reference || ""}`)} `;
  return (
    TEINTE_MASSE_OPTIONS.find((t) => {
      if (text.includes(` ${normalizeText(t)} `)) return true;
      // Les libellés DB peuvent omettre "MAT" (ex: "NOIR ZÉRO 100x255cm" au lieu de "NOIR ZERO MAT 100x255cm")
      // Pour les options à 3+ mots se terminant par "MAT", accepter aussi le préfixe sans "MAT"
      const words = t.split(" ");
      if (words[words.length - 1] === "MAT" && words.length >= 3) {
        return text.includes(` ${normalizeText(words.slice(0, -1).join(" "))} `);
      }
      return false;
    }) || null
  );
}

function buildProfilsKitsRows(payload, defaultClient) {
  return (payload.profilsKitsJobs || []).map((pkJob) => ({
    id: pkJob.id,
    type: "profils_kits",
    numCmd: pkJob.numCmd,
    client: findKnownClient(pkJob.client) || defaultClient,
    dossierNumero: payload.numero,
    ville: pkJob.ville || "",
    ref: pkJob.ref || "",
    articleType: pkJob.articleType || "profil",
    libelle: pkJob.libelle || "",
    quantite: pkJob.quantite ?? 0,
    checked: true,
    status: "Prêt",
    formatPath: null,
    formatTauroValue: null,
    selectedFileObject: null,
    isCredence: false,
    credence2: null,
    _absorbedBy: null,
  }));
}

function buildRows(payload, pathData, formatTauro) {
  const defaultClient = findKnownClient(payload.client) || "";

  return payload.visualJobs.map((job, index) => {
    const client = findKnownClient(job.clientVisu) || defaultClient;
    const folders = pathData?.[client] || [];
    const baseId = job.id || `${job.numCmd || job.libelle || "row"}-${index}`;
    const formatTauroValue = findFormatTauro(formatTauro, job.formatTauro);

    const detectedTeinte = detectTeinteMasse(job);
    if (detectedTeinte) {
      const teinteFormatFolder = findFormatFolder(folders, job.formatVisu);
      return {
        id: baseId,
        ...job,
        client,
        dossierNumero: payload.numero,
        checked: Boolean(formatTauroValue),
        formatPath: teinteFormatFolder?.path || job.formatVisu || "",
        formatTauroValue,
        candidates: [],
        selectedFile: detectedTeinte,
        selectedFileObject: { name: detectedTeinte },
        prodBlanc: false,
        teinteMasse: true,
        isCredence: false,
        credence2: null,
        _absorbedBy: null,
        status: formatTauroValue ? "Prêt" : "Format Tauro requis",
      };
    }

    const formatFolder = findFormatFolder(folders, job.formatVisu);
    const files = formatFolder?.files || [];
    const candidates = findFileCandidates(files, job, client);
    const bestCandidate = candidates[0] || null;
    const selectedFile = bestCandidate?.name || "";
    const selectedFileObject = bestCandidate || null;
    const bestScore = candidates[0]?.score ?? 0;
    const hasRefMatch = bestScore >= 800; // au moins articleReference (800 pts) — mot seul < 800
    const hasStrongMatch =
      hasRefMatch &&
      (candidates.length === 1 || (candidates.length > 1 && candidates[0].score > (candidates[1]?.score || 0) + 20));

    const isCredence = isCredenceFormat(job.formatVisu);
    return {
      id: baseId,
      ...job,
      client,
      dossierNumero: payload.numero,
      checked: Boolean(selectedFile && hasStrongMatch),
      formatPath: formatFolder?.path || "",
      formatTauroValue,
      candidates,
      selectedFile,
      selectedFileObject,
      prodBlanc: REGEX_BLANC.test(selectedFile.split("/").pop()),
      teinteMasse: false,
      isCredence,
      credence2: null,
      _absorbedBy: null,
      status: !formatTauroValue
        ? "Format Tauro requis"
        : files.length === 0
          ? "Aucun fichier local trouvé"
          : candidates.length === 0
            ? "Aucune référence trouvée — sélection manuelle requise"
            : hasStrongMatch
              ? "Prêt"
              : "Choix requis",
    };
  });
}

function parseNumbers(value) {
  const tokens = value
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const numbers = tokens
    .map((token) => {
      if (/^\d+$/.test(token)) return token;
      // Code-barre type D165619/00 → 165619
      const m = token.match(/^[A-Za-z]*(\d+)\/\d+$/);
      return m ? m[1] : null;
    })
    .filter(Boolean);
  return [...new Set(numbers)];
}

function getLastToken(value) {
  const tokens = value.split(/[\s,;\n]+/);
  return tokens[tokens.length - 1] || "";
}

function replaceLastToken(value, replacement) {
  const tokens = value.split(/[\s,;\n]+/);
  tokens[tokens.length - 1] = replacement;
  return tokens.join(" ").trim();
}

function DossierAutocomplete({ pathData, formatTauro, onAutoFill, gamesysOk }) {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadedDossiers, setLoadedDossiers] = useState([]);
  const [message, setMessage] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    const token = getLastToken(inputValue);
    if (token.length < 3 || !/^\d+$/.test(token)) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const controller = new AbortController();
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/dossiers/search?q=${token}&limit=8`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setShowSuggestions(true);
        setSuggestionIndex(-1);
      } catch (err) {
        if (err.name !== "AbortError") setSuggestions([]);
      }
    }, 280);
    return () => {
      clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [inputValue]);

  function emitJobs(dossiers) {
    if (!onAutoFill) return;
    const allJobs = dossiers.flatMap((d) => d.jobs);
    if (allJobs.length === 0) {
      onAutoFill({ clearMode: true });
    } else {
      onAutoFill({ allJobs, client: dossiers[0]?.clientKey });
    }
  }

  function handleClearDossier(numero) {
    const next = loadedDossiers.filter((d) => d.numero !== numero);
    setLoadedDossiers(next);
    emitJobs(next);
    if (next.length === 0) setMessage(null);
  }

  function handleClearAll() {
    setLoadedDossiers([]);
    setInputValue("");
    setMessage(null);
    if (onAutoFill) onAutoFill({ clearMode: true });
  }

  function handleSelectSuggestion(suggestion) {
    setShowSuggestions(false);
    setSuggestions([]);
    const newValue = replaceLastToken(inputValue, suggestion.numero);
    setInputValue(newValue);
    loadNumbers(parseNumbers(newValue));
  }

  async function handleSearch() {
    setSuggestions([]);
    setShowSuggestions(false);
    const numbers = parseNumbers(inputValue);
    if (numbers.length === 0) {
      setMessage({ type: "error", text: "Saisis au moins un numéro de dossier." });
      return;
    }
    await loadNumbers(numbers);
  }

  async function loadNumbers(numbers) {
    if (numbers.length === 0) return;

    const alreadyLoaded = new Set(loadedDossiers.map((d) => d.numero));
    const newNumbers = numbers.filter((n) => !alreadyLoaded.has(n));

    if (newNumbers.length === 0) {
      setMessage({ type: "info", text: "Ces dossiers sont déjà chargés." });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    const results = await Promise.allSettled(
      newNumbers.map((numero) =>
        fetch(`${API_BASE}/dossier-api/${numero}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        }).then((res) => res.json().then((body) => ({ ok: res.ok, numero, body }))),
      ),
    );

    setIsLoading(false);

    const newDossiers = [];
    const errors = [];
    const warnings = [];

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(result.reason?.message || "Erreur réseau");
        continue;
      }
      const { ok, numero, body } = result.value;
      if (!ok) {
        errors.push(`${numero} : ${body.error || "Erreur serveur"}`);
        continue;
      }

      const clientKey = findKnownClient(body.client) || "";
      const rows = buildRows(body, pathData, formatTauro);
      const pkRows = buildProfilsKitsRows(body, clientKey);
      // On garde toute ligne dont le dossier de format a été résolu (ou teinte masse),
      // même sans fichier présélectionné, pour permettre un choix manuel dans le tableau
      // plutôt que de la faire disparaître silencieusement.
      const validRows = rows.filter((r) => r.formatPath || r.teinteMasse);
      const manualSelectionRows = validRows.filter((r) => !r.teinteMasse && !r.selectedFileObject);
      const allRows = [
        ...validRows.map((row) => ({ ...row, dossierNumero: body.numero })),
        ...pkRows,
      ];

      if (allRows.length === 0) {
        errors.push(`${numero} : Aucun visuel exploitable et aucun profil/kit trouvé.`);
        continue;
      }

      if (manualSelectionRows.length > 0) {
        const libelles = manualSelectionRows.map((r) => r.libelle || r.reference || r.id).join(", ");
        warnings.push(
          `${numero} : ${manualSelectionRows.length} visuel(s) sans référence trouvée — sélection manuelle requise (${libelles})`,
        );
      }

      newDossiers.push({
        numero: body.numero,
        client: body.client,
        clientKey,
        jobs: allRows,
      });
    }

    if (newDossiers.length > 0) {
      setInputValue("");
      const allDossiers = [...loadedDossiers, ...newDossiers];
      setLoadedDossiers(allDossiers);
      emitJobs(allDossiers);
    }

    const messages = [...errors, ...warnings];
    if (messages.length > 0) {
      setMessage({
        type: errors.length > 0 && errors.length === newNumbers.length ? "error" : "warning",
        text: messages.join(" · "),
      });
    }
  }

  const gamesysOffline = gamesysOk === false;

  return (
    <Segment className="dossier-autocomplete" color="grey">
      {gamesysOffline && (
        <Message warning size="tiny" style={{ marginBottom: 8 }}>
          <Icon name="warning sign" />
          Gamesys indisponible — la recherche par dossier n'est pas accessible.
        </Message>
      )}
      <div className="dossier-autocomplete-search">
        <div className="dossier-input-wrapper">
          <Input
            placeholder="N° Dossier(s) — ex: 164629 164630"
            value={inputValue}
            onChange={(e, d) => setInputValue(d.value)}
            disabled={gamesysOffline}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSuggestionIndex((i) => Math.max(i - 1, -1));
              } else if (event.key === "Escape") {
                setShowSuggestions(false);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (showSuggestions && suggestionIndex >= 0 && suggestions[suggestionIndex]) {
                  handleSelectSuggestion(suggestions[suggestionIndex]);
                } else {
                  handleSearch();
                }
              }
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="dossier-suggestions">
              {suggestions.map((s, i) => (
                <div
                  key={s.numero}
                  className={`dossier-suggestion-item${i === suggestionIndex ? " active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectSuggestion(s);
                  }}
                >
                  <span className="suggestion-numero">{s.numero}</span>
                  {(s.magasin || s.ville || s.client) && (
                    <span className="suggestion-label">{s.magasin || s.ville || s.client}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <Button type="button" size="small" compact color="vk" loading={isLoading} disabled={isLoading || gamesysOffline} onClick={handleSearch}>
          Rechercher
        </Button>
        {loadedDossiers.length > 0 && (
          <Button
            type="button"
            size="mini"
            basic
            color="red"
            icon="trash alternate"
            onClick={handleClearAll}
            title="Vider tous les dossiers"
          />
        )}
      </div>

      {loadedDossiers.length > 0 && (
        <div className="dossier-chips">
          {loadedDossiers.map((d) => (
            <Label key={d.numero} color="green" size="small">
              <Icon name="check circle" />
              {d.numero}
              <span style={{ opacity: 0.7, marginLeft: 3 }}>({d.jobs.length})</span>
              <Icon name="delete" link style={{ marginLeft: 4 }} onClick={() => handleClearDossier(d.numero)} />
            </Label>
          ))}
        </div>
      )}

      {message && (
        <Message
          compact
          info={message.type === "info"}
          warning={message.type === "warning"}
          error={message.type === "error"}
          content={message.text}
          style={{ marginTop: 6 }}
        />
      )}
    </Segment>
  );
}

DossierAutocomplete.propTypes = {
  pathData: PropTypes.object,
  formatTauro: PropTypes.array.isRequired,
  onAutoFill: PropTypes.func,
  gamesysOk: PropTypes.bool,
};

export default DossierAutocomplete;
