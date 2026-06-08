import PropTypes from "prop-types";
import { useState } from "react";
import { Button, Icon, Input, Label, Message, Segment } from "semantic-ui-react";

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

function canonicalClient(client) {
  const normalized = normalizeText(client);
  return (
    CLIENTS.find((value) => CLIENT_ALIASES[value].some((alias) => normalized.includes(alias))) || "LM"
  );
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
  return formatTauro.find((value) => normalizeText(value).includes(token)) || `Deco_Std_${format}`;
}

function scoreFile(file, job) {
  const name = normalizeText(file?.name);
  const labelWords = normalizeText(job.libelle)
    .split(/\s+/)
    .filter((word) => word.length > 3 && !/^\d/.test(word));

  let score = 0;
  if (job.reference && name.includes(normalizeText(job.reference))) score += 100;
  if (job.articleReference && name.includes(normalizeText(job.articleReference))) score += 80;
  if (job.formatVisu && name.includes(formatToken(job.formatVisu))) score += 30;
  score += labelWords.filter((word) => name.includes(word)).length * 8;

  return score;
}

function findFileCandidates(files, job) {
  return files
    .map((file) => ({ ...file, score: scoreFile(file, job) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function buildRows(payload, pathData, formatTauro) {
  const client = findKnownClient(payload.client) || "";
  const folders = pathData?.[client] || [];

  return payload.visualJobs.map((job, index) => {
    const formatFolder = findFormatFolder(folders, job.formatVisu);
    const files = formatFolder?.files || [];
    const candidates = findFileCandidates(files, job);
    const bestCandidate = candidates[0] || null;
    const selectedFile = bestCandidate?.name || "";
    const selectedFileObject = bestCandidate || null;
    const hasStrongMatch =
      candidates.length === 1 ||
      (candidates.length > 1 && candidates[0].score > (candidates[1]?.score || 0) + 20);

    return {
      id: job.id || `${job.numCmd || job.libelle || "row"}-${index}`,
      ...job,
      client,
      checked: Boolean(selectedFile && hasStrongMatch),
      formatPath: formatFolder?.path || "",
      formatTauroValue: findFormatTauro(formatTauro, job.formatTauro),
      candidates,
      selectedFile,
      selectedFileObject,
      status:
        candidates.length === 0
          ? "Aucun fichier local trouvé"
          : hasStrongMatch
            ? "Prêt"
            : "Choix requis",
    };
  });
}

function DossierAutocomplete({ host, port, pathData, formatTauro, onAutoFill }) {
  const [numero, setNumero] = useState("");
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filledFrom, setFilledFrom] = useState(null);
  const [multipleJobs, setMultipleJobs] = useState([]);
  const [apiClient, setApiClient] = useState("");

  function handleClear() {
    setFilledFrom(null);
    setMultipleJobs([]);
    setMessage(null);
    setNumero("");
    setApiClient("");
    if (onAutoFill) onAutoFill({ clearMode: true });
  }

  async function handleSearch() {
    const trimmedNumero = numero.trim();
    if (!trimmedNumero) {
      setMessage({ type: "error", text: "Saisis un numéro de dossier." });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setFilledFrom(null);
    setMultipleJobs([]);

    try {
      const response = await fetch(`http://${host}:${port}/dossier-api/${trimmedNumero}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Impossible de charger le dossier.");
      }

      const apiClientName = result.client || "";
      setApiClient(apiClientName);
      const apiClientKey = findKnownClient(apiClientName) || "";

      const nextRows = buildRows(result, pathData, formatTauro);
      const validRows = nextRows.filter((r) => r.formatPath && r.formatTauroValue && r.selectedFileObject);

      if (validRows.length === 0) {
        setMessage({
          type: "warning",
          text: `Aucun visuel exploitable trouvé pour le dossier ${result.numero}.`,
        });
        if (onAutoFill) onAutoFill({ client: apiClientKey, clientName: apiClientName });
        return;
      }

      const jobs = validRows.map((row) => ({
        id: row.id,
        label: `${row.commande || row.numCmd} — ${row.formatVisu || "?"} — ${row.ville || "?"} × ${row.ex || 1}`,
        data: row,
      }));

      setMultipleJobs(jobs);
      setFilledFrom({ numero: trimmedNumero });

      if (onAutoFill) {
        onAutoFill({
          clientName: apiClientName,
          client: apiClientKey,
          allJobs: jobs.map((j) => j.data),
          formatTauro: jobs[0].data.formatTauroValue,
          format: jobs[0].data.formatPath,
          file: jobs[0].data.selectedFileObject,
          numCmd: jobs[0].data.numCmd,
          ville: jobs[0].data.ville,
          ex: jobs[0].data.ex,
        });
      }
    } catch (error) {
      setApiClient("");
      setMessage({ type: "error", text: error.message });
      if (onAutoFill) onAutoFill({ manualMode: true });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Segment className="dossier-autocomplete" color="grey">
      <div className="dossier-autocomplete-search">
        <Input
          placeholder="N° Dossier API"
          value={numero}
          onChange={(e, data) => setNumero(data.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSearch();
            }
          }}
        />
        <Button type="button" color="vk" loading={isLoading} disabled={isLoading} onClick={handleSearch}>
          Rechercher
        </Button>
        {filledFrom && (
          <Label color="green" size="small" style={{ alignSelf: "center" }}>
            <Icon name="check circle" />
            Dossier {filledFrom.numero}
            {multipleJobs.length > 1 && ` — ${multipleJobs.length} visuels`}
            <Icon name="delete" link style={{ marginLeft: 6 }} onClick={handleClear} />
          </Label>
        )}
      </div>

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
  host: PropTypes.string.isRequired,
  port: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  pathData: PropTypes.object,
  formatTauro: PropTypes.array.isRequired,
  onAutoFill: PropTypes.func,
};

export default DossierAutocomplete;
