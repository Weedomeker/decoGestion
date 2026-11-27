import PropTypes from "prop-types";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Button,
  Checkbox,
  Confirm,
  Icon,
  Popup,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "semantic-ui-react";
import Dropdown from "./AutoDropdown";
import ApercuSessionTauro from "./ApercuSessionTauro";
import AlerteRepriseArret from "./AlerteRepriseArret";
import AlerteDepotsEnAttente from "./AlerteDepotsEnAttente";
import BarreProgression, { EtapeLigne, IconeLigne } from "./BarreProgression";
import "../css/JobsList.css";
import { API_BASE, WS_BASE } from "../utils/api";
import { ligneFormat, totalEx } from "../utils/totalEx";

/** « 62 ex. » (ou « Sélection : 50 ex. / 62 ») ; infobulle : ex. par plaque, Mat / Brillant, stock à part */
function TotalEx({ file, selection }) {
  const detail = selection || file;
  return (
    <Popup
      position="top center"
      size="small"
      on={["hover", "focus"]}
      trigger={
        <span className="file-total-ex" tabIndex={0}>
          {selection ? (
            <>
              Sélection : <b>{selection.ex} ex.</b> / {file.ex}
            </>
          ) : (
            <>
              Total : <b>{file.ex} ex.</b>
            </>
          )}
        </span>
      }
      content={
        <div className="file-total-ex-detail">
          <div className="file-total-ex-titre">{selection ? "Sélection" : "File"} par plaque</div>
          <table>
            <tbody>
              {detail.formats.map((f) => (
                <tr key={f.plaque}>
                  <td>{f.plaque}</td>
                  <td>{ligneFormat(f)}</td>
                </tr>
              ))}
              {detail.stock > 0 && (
                <tr>
                  <td>Stock</td>
                  <td>{detail.stock} ex. — hors session</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      }
    />
  );
}

const resumeExPropType = PropTypes.shape({
  ex: PropTypes.number.isRequired,
  stock: PropTypes.number.isRequired,
  formats: PropTypes.arrayOf(
    PropTypes.shape({ plaque: PropTypes.string, ex: PropTypes.number, mat: PropTypes.number, brillant: PropTypes.number }),
  ).isRequired,
});
TotalEx.propTypes = { file: resumeExPropType.isRequired, selection: resumeExPropType };

const CONCURRENCY_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  key: i + 1,
  value: i + 1,
  text: String(i + 1),
}));

const CLE_ONGLET_FILE = "decoGestion.ongletFile";
const ONGLETS_FILE = ["attente", "traites"];

const fuseauParis = { timeZone: "Europe/Paris" };

// Jobs du jour : l'heure seule (« 08:12 ») ; sinon jour et heure (« 18/11 08:12 »).
function dateFile(valeur) {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "";
  const heure = date.toLocaleTimeString("fr-FR", { ...fuseauParis, hour: "2-digit", minute: "2-digit" });
  const jour = date.toLocaleDateString("fr-FR", { ...fuseauParis, day: "2-digit", month: "2-digit" });
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { ...fuseauParis, day: "2-digit", month: "2-digit" });
  return jour === aujourdhui ? heure : `${jour} ${heure}`;
}

// Nom du visuel tel qu'affiché dans la File : sans format, référence ni vernis selon l'enseigne.
function nomVisuel(visuel, client) {
  let visuelName = visuel?.split("/")?.pop() ?? "";
  const regexFormat = visuelName.match(/\d{3}x\d{2,}/i);
  const regexRef = visuelName.match(/\d{8,}/);
  const cleanVisuelNameCasto = ["cred", "cm", regexFormat?.[0], regexRef?.[0], ".pdf", "mat", "brillant"].filter(
    Boolean,
  );
  if (client === "CASTO") {
    cleanVisuelNameCasto.map((el) => (visuelName = visuelName.toLowerCase().replace(el, "")));
  }
  if (client === "BRICO") {
    const regex = /^[A-Z]+-\d+$/;
    visuelName = visuelName.match(regex)?.[0] ?? visuelName;
    visuelName = visuelName.replace("BRILLANT", "").replace("MAT", "");
  }
  if (regexFormat && regexFormat[0]) {
    return visuelName.split(regexFormat[0])[0].toUpperCase();
  }
  return visuelName.toUpperCase();
}

function lireOngletFile() {
  try {
    const onglet = localStorage.getItem(CLE_ONGLET_FILE);
    return ONGLETS_FILE.includes(onglet) ? onglet : "attente";
  } catch {
    return "attente";
  }
}

// Un job = un <tbody> déplaçable : les 2 lignes d'une crédence restent groupées pendant le drag.
function SortableJobGroup({ id, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 3 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  return (
    <tbody ref={setNodeRef} style={style} className={`body-table-jobs job-group${isDragging ? " dragging" : ""}`}>
      {children({ handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners } })}
    </tbody>
  );
}

SortableJobGroup.propTypes = {
  id: PropTypes.string.isRequired,
  children: PropTypes.func.isRequired,
};

function JobsList({ formatTauro, refreshToken, onPendingCountChange, onAlerteChange }) {
  const [data, setData] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [onLoading, setOnLoading] = useState(false);
  // { etat, recuA } : dernier message `progression` du serveur et heure (poste) de sa réception.
  const [progression, setProgression] = useState({ etat: undefined, recuA: 0 });
  const [statusFlag, setStatusFlag] = useState(0);
  const [stickersOnly, setStickersOnly] = useState(false);
  // const [stickersData, setStickersData] = useState(true);
  // const [paperSticker, setPaperSticker] = useState('A4');
  const [filter, setFilter] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmClearCompleted, setConfirmClearCompleted] = useState(false);
  const [apercuTauro, setApercuTauro] = useState(null); // { mode, ids, message } ou null
  const [confirmCancelRun, setConfirmCancelRun] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [queueStatus, setQueueStatus] = useState({ running: false, paused: false, concurrency: null });
  const [repriseArret, setRepriseArret] = useState(null);
  const [depotsEnAttente, setDepotsEnAttente] = useState(null);
  const [ongletFile, setOngletFile] = useState(lireOngletFile);
  // Nombre de traités déjà vus : null tant que les données ne sont pas chargées.
  const [vusTraites, setVusTraites] = useState(null);

  const choisirOnglet = useCallback((onglet) => {
    setOngletFile(onglet);
    try {
      localStorage.setItem(CLE_ONGLET_FILE, onglet);
    } catch {
      // stockage indisponible : l'onglet n'est simplement pas mémorisé
    }
  }, []);

  // Signal sur l'onglet File : l'opérateur peut être sur un autre onglet au redémarrage.
  useEffect(() => {
    onAlerteChange?.(Boolean(repriseArret || depotsEnAttente));
  }, [repriseArret, depotsEnAttente, onAlerteChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (data.length > 0) {
      onPendingCountChange?.(data[0].jobs.length);

      // La sélection ne garde que les jobs encore présents dans la file.
      const existing = new Set(data[0].jobs.map((job) => String(job._id)));
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => existing.has(id)));
        return next.size === prev.size ? prev : next;
      });
    }
  }, [data, onPendingCountChange]);

  // WebSocket : connexion avec reconnexion automatique
  useEffect(() => {
    let ws;
    let reconnectTimer;
    let unmounted = false;

    function handleMessage(event) {
      const message = JSON.parse(event.data);

      if (message.type === "update") {
        setRefreshFlag((prev) => prev + 1);
      }

      if (message.type === "start") {
        setOnLoading(true);
        // Le serveur vient de vider les traités du lancement précédent.
        setRefreshFlag((prev) => prev + 1);
      }

      if (message.type === "progression") {
        setProgression({ etat: message.progression, recuA: Date.now() });
      }

      if (message.type === "queue") {
        setQueueStatus({ running: message.running, paused: message.paused, concurrency: message.concurrency });
        if (message.running) setOnLoading(true);
        else setOnLoading(false);
      }

      if (message.completedJob) {
        setData((prevData) => {
          const prev = prevData[0];
          if (!prev) return prevData;
          const completedJobs = Array.isArray(message.completedJob) ? message.completedJob : [message.completedJob];
          const updatedCompleted = [...prev.completed, ...completedJobs];
          const updatedJobs = prev.jobs.filter((job) => !completedJobs.some((cj) => cj._id === job._id));
          return [{ jobs: updatedJobs, completed: updatedCompleted }];
        });
      }

      if (message.type === "end") {
        setOnLoading(false);
        // Les jobs annulés ou en échec restent dans la file : resynchronisation.
        setRefreshFlag((prev) => prev + 1);
      }
    }

    let attempt = 0;
    const MAX_DELAY = 30000;

    function connect() {
      ws = new WebSocket(WS_BASE);
      ws.onopen = () => {
        // Reconnexion (serveur redémarré ?) : la file a pu changer, et un avertissement d'arrêt apparaître.
        if (attempt > 0) {
          setRefreshFlag((prev) => prev + 1);
          setStatusFlag((prev) => prev + 1);
        }
        attempt = 0;
        setWsConnected(true);
      };
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        setWsConnected(false);
      };
      ws.onclose = () => {
        setWsConnected(false);
        if (!unmounted) {
          const delay = Math.min(1000 * Math.pow(2, attempt), MAX_DELAY);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Fetch des données : déclenché au montage, quand show change, ou quand refreshFlag s'incrémente
  useEffect(() => {
    const dataFetch = async () => {
      try {
        const response = await fetch(`${API_BASE}/jobs/`, { method: "GET" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const res = await response.json();
        setData([{ jobs: res.jobs, completed: res.completed }]);
        setRepriseArret(res.repriseArret || null);
        setDepotsEnAttente(res.depotsEnAttente || null);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    dataFetch();
  }, [refreshFlag, refreshToken]);

  // État de la file BullMQ au montage et à la reconnexion : restaure l'affichage d'un traitement en cours.
  useEffect(() => {
    const statusFetch = async () => {
      try {
        const response = await fetch(`${API_BASE}/queue/status`, { method: "GET" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();
        setQueueStatus({ running: status.running, paused: status.paused, concurrency: status.concurrency });
        setOnLoading(Boolean(status.running));
        setProgression({ etat: status.progression ?? null, recuA: Date.now() });
      } catch (error) {
        console.error("Error fetching queue status:", error);
      }
    };
    statusFetch();
  }, [statusFlag]);

  useEffect(() => {
    const dataFetch = async () => {
      try {
        const response = await fetch(`${API_BASE}/config/`, { method: "GET" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const res = await response.json();
        setFilter(res.vernis);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    dataFetch();
  }, []);

  const pendingJobs = data?.[0]?.jobs ?? [];
  const nbJobs = pendingJobs.length;
  const nbCompleted = data?.[0]?.completed?.length ?? 0;
  const nbSelected = selectedIds.size;

  // Pastille « nouveaux traités » : rien au premier chargement ; vus dès que l'onglet Traités est ouvert ;
  // recalée si l'historique est vidé.
  useEffect(() => {
    if (isLoading) return;
    setVusTraites((vus) => (vus === null || ongletFile === "traites" || nbCompleted < vus ? nbCompleted : vus));
  }, [isLoading, ongletFile, nbCompleted]);
  const nouveauxTraites = vusTraites === null ? 0 : Math.max(0, nbCompleted - vusTraites);

  const ongletsClavier = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const suivant = ongletFile === "attente" ? "traites" : "attente";
    choisirOnglet(suivant);
    document.getElementById(`file-tab-${suivant}`)?.focus();
  };
  // Pied de la File : total d'ex. de la sélection, sinon de toute la file ; détail par plaque en infobulle.
  const totalFile = totalEx(pendingJobs);
  const totalSelection = nbSelected > 0 ? totalEx(pendingJobs.filter((j) => selectedIds.has(String(j._id)))) : null;

  // Sans sélection, le serveur traite toute la file.
  const selectionPayload = nbSelected > 0 ? { ids: pendingJobs.filter((j) => selectedIds.has(String(j._id))).map((j) => j._id) } : {};

  // Appel générique d'une action sur la file ; renvoie le JSON ou null en cas d'erreur (affichée).
  const queueAction = async (endpoint, method, body, errorLabel) => {
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(result.error || `${errorLabel} (${response.status})`);
        return null;
      }
      return result;
    } catch (error) {
      console.error(`${errorLabel}:`, error);
      setActionError("Impossible de contacter le serveur.");
      return null;
    }
  };

  const handleGenerateStickers = () =>
    queueAction("/generate_stickers", "POST", selectionPayload, "Erreur génération stickers");

  const checkVernis = (value) => {
    value = value.toLowerCase();
    // S'assurer que value est une chaîne
    if (typeof value !== "string") {
      console.error('Le paramètre "value" doit être une chaîne de caractères.');
      return;
    }
    // Vérifie si le nom contient un des éléments filtrés
    const find = filter.find((el) => value.includes(el.toLowerCase()));

    if (find) {
      return find;
    } else {
      return "";
    }
  };

  // Lance le traitement après l'aperçu ; l'aperçu est fermé, la progression passe par le WebSocket.
  const runJobsList = async (tauro, ids) => {
    if (nbJobs === 0) return;
    setApercuTauro(null);
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE}/run_jobs`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ run: true, formatTauro: formatTauro, ...(ids ? { ids } : {}), tauro }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.code === "PLAN_CHANGE") {
        setApercuTauro({ mode: tauro.mode, ids, finition: tauro.finition, relancer: tauro.relancer, taille: tauro.taille, message: "La file a changé, aperçu mis à jour" });
        return;
      }
      if (response.status === 409) {
        setActionError("Un traitement est déjà en cours");
        return;
      }
      if (!response.ok) {
        setActionError(result.error || `Erreur traitement des jobs (${response.status})`);
        return;
      }
      setSelectedIds(new Set());
      setRefreshFlag((prev) => prev + 1);
    } catch (error) {
      console.error("Erreur traitement des jobs:", error);
      setActionError("Impossible de contacter le serveur.");
    }
  };

  const handlePauseResume = async () => {
    const status = await queueAction(
      queueStatus.paused ? "/queue/resume" : "/queue/pause",
      "POST",
      null,
      queueStatus.paused ? "Erreur reprise de la file" : "Erreur mise en pause",
    );
    if (status) setQueueStatus((prev) => ({ ...prev, paused: status.paused }));
  };

  // Job du dernier lancement, par _id : état et étape affichés sur sa ligne.
  const suivis = useMemo(
    () => new Map((progression.etat?.jobs ?? []).map((job) => [job.id, job])),
    [progression.etat],
  );

  // Détails affichés dans la fiche d'un segment. Null si le job n'est plus dans la file.
  const detailsDe = (id) => {
    const job = [...(data[0]?.completed ?? []), ...pendingJobs].find((j) => j && String(j._id) === id);
    if (!job) return null;
    const credence = Boolean(job.format_visu?.match(/\d{3}x\d{2,}/i) && job.visuel2);
    const court = (format) => format?.split("_").pop();
    const formats = [court(job.smFormat || job.format_visu), credence ? court(job.format2_visu) : null].filter(Boolean);
    return {
      visuels: [nomVisuel(job.visuel, job.client), credence ? nomVisuel(job.visuel2, job.client) : null]
        .filter(Boolean)
        .map((nom) => nom.trim()),
      fichier: (job.jpgName?.split("/").pop() ?? "").replace(/\.jpg$/i, job.teinteMasse || job.useStock ? ".jpg" : ".pdf"),
      commande: [job.cmd, job.client, job.ville].filter(Boolean).join(" "),
      format: [...new Set(formats)].join(" + "),
      plaque: court(job.format_Plaque),
      vernis: checkVernis(job.visuel ?? "") || job.smVernis || "",
      ex: job.panneaux || job.ex,
      jpgName: job.jpgName,
    };
  };

  // Clic sur un segment : le bon onglet, puis la ligne du job.
  const allerAuJob = useCallback(
    (job) => {
      choisirOnglet(job.etat === "fait" ? "traites" : "attente");
      setTimeout(() => {
        document
          .querySelector(`.jobs-table tr[data-job-id="${CSS.escape(job.id)}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 50);
    },
    [choisirOnglet],
  );

  const handleCancelRun = () => queueAction("/queue/cancel", "POST", null, "Erreur annulation");

  const handleConcurrencyChange = async (value) => {
    const previous = queueStatus.concurrency;
    setQueueStatus((prev) => ({ ...prev, concurrency: value }));
    const result = await queueAction("/queue/concurrency", "PATCH", { concurrency: value }, "Erreur réglage concurrence");
    if (!result) setQueueStatus((prev) => ({ ...prev, concurrency: previous }));
  };

  // Réordonnancement optimiste ; retour à l'ordre précédent si le serveur refuse.
  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const snapshot = pendingJobs;
    const oldIndex = snapshot.findIndex((job) => String(job._id) === active.id);
    const newIndex = snapshot.findIndex((job) => String(job._id) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(snapshot, oldIndex, newIndex);
    setData((prevData) => [{ ...prevData[0], jobs: reordered }]);

    const result = await queueAction(
      "/reorder_jobs",
      "PATCH",
      { ids: reordered.map((job) => job._id) },
      "Erreur réordonnancement",
    );
    if (!result) setData((prevData) => [{ ...prevData[0], jobs: snapshot }]);
  };

  const toggleSelected = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked) => {
    setSelectedIds(checked ? new Set(pendingJobs.map((job) => String(job._id))) : new Set());
  };

  const handleDeleteJob = async (id) => {
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE}/delete_job`, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ _id: id }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setActionError(result.error || `Erreur suppression du job (${response.status})`);
        return;
      }

      // Mise à jour de l'état après la suppression réussie
      setData((prevData) => [{ ...prevData[0], jobs: prevData[0].jobs.filter((item) => item._id !== id) }]);
    } catch (error) {
      console.error("Error deleting job:", error);
      setActionError("Impossible de contacter le serveur.");
    }
  };

  const handleDeleteJobComplete = async () => {
    setActionError(null);
    const snapshot = data[0]?.completed ?? [];
    setData((prevData) => [{ ...prevData[0], completed: [] }]);
    try {
      const response = await fetch(`${API_BASE}/delete_job_completed`, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });

      if (!response.ok) {
        // Restaurer l'état si l'appel a échoué
        setData((prevData) => [{ ...prevData[0], completed: snapshot }]);
        const result = await response.json().catch(() => ({}));
        setActionError(result.error || `Erreur suppression des jobs terminés (${response.status})`);
      }
    } catch (error) {
      console.error("Error deleting jobs:", error);
      setData((prevData) => [{ ...prevData[0], completed: snapshot }]);
      setActionError("Impossible de contacter le serveur.");
    }
  };

  // Lignes d'un job (1, ou 2 pour une crédence amalgamée). `handleProps` : poignée de drag (file en attente).
  const renderJobRows = (value, i, status, handleProps) => {
    const baseEntry = {
      client: value.client,
      date: value.date,
      cmd: value.cmd,
      cmd2: value.cmd2,
      ville: value.ville,
      format_Plaque: value.format_Plaque,
      ex: value.ex,
      cut: value.cut,
      jobId: value._id,
    };

    // Préparation du premier visuel
    const entries = [
      {
        ...baseEntry,
        visuel: value.visuel,
        jpgName: value.jpgName,
        format_visu: value.smFormat || value.format_visu,
        ref: value.ref,
      },
    ];
    // Si credences → ajouter la deuxième ligne
    if (value.format_visu && value.format_visu.match(/\d{3}x\d{2,}/i) && value.visuel2) {
      entries.push({
        ...baseEntry,
        cmd: value.complementStock ? "STOCK" : value.cmd2,
        // Crédence dupliquée (ex = plaques) : en nombre impair, le panneau en trop part en stock.
        ex: value.panneaux ? value.panneaux - value.ex : value.ex,
        visuel: value.visuel2,
        jpgName: value.jpgName2,
        format_visu: value.format2_visu,
        ref: value.ref2,
      });
    }

    // Générer les lignes (1 pour LM, 2 pour CASTO)
    return entries.map((entry, idx) => {
      const title = entry.jpgName?.split("/")?.pop() ?? "";
      const url = `${API_BASE}/public/` + entry.jpgName.replace(/#/i, "%23");

      const visuelName = nomVisuel(entry.visuel, entry.client);

      const isFirstRow = idx === 0;
      const jobKey = String(entry.jobId);
      const suivi = status === "jobs" && isFirstRow ? suivis.get(jobKey) : null;
      // L'icône ne remplace la poignée que pendant le lancement ; en attente, seulement si l'ordre est figé (Tauro).
      const iconeSuivi =
        suivi &&
        onLoading &&
        progression.etat.phase !== "fini" &&
        !progression.etat.etiquettesSeules &&
        (["cours", "nouvelle", "echec"].includes(suivi.etat) || progression.etat.ordreFige);

      return (
        <TableRow
          key={`${i}-${idx}`}
          className={`table-row${isFirstRow ? "" : " job-row-second"}`}
          data-client={entry.client}
          data-job-id={jobKey}
        >
          <TableCell className="job-control-cell">
            {iconeSuivi && <IconeLigne job={suivi} />}
            {status === "jobs" && isFirstRow && !iconeSuivi && (
              <span
                {...handleProps}
                className="job-drag-handle"
                title="Glisser pour réordonner"
                aria-label="Glisser pour réordonner"
              >
                <Icon name="bars" fitted />
              </span>
            )}
          </TableCell>
          <TableCell className="job-control-cell">
            {status === "jobs" && isFirstRow && (
              <Checkbox
                checked={selectedIds.has(jobKey)}
                disabled={onLoading}
                onChange={(e, { checked }) => toggleSelected(jobKey, checked)}
                aria-label="Sélectionner ce job"
              />
            )}
          </TableCell>
          <TableCell>
            <span className={`client-name client-name--${entry.client?.toLowerCase()}`}>{entry.client}</span>
          </TableCell>
          <TableCell title={new Date(entry.date).toLocaleString("fr-FR", fuseauParis)}>{dateFile(entry.date)}</TableCell>
          <TableCell>{entry.cmd}</TableCell>
          <TableCell>{entry.ville}</TableCell>

          <TableCell>
            <div className="job-visuel">
              {!stickersOnly && status === "completed" ? (
                <a href={url} data-lightbox={title} data-title={title}>
                  {visuelName}
                </a>
              ) : (
                <span>{visuelName}</span>
              )}
              {value.teinteMasse && <span className="job-tag job-tag--tm">Teinte masse</span>}
              <EtapeLigne job={suivi} />
            </div>
          </TableCell>

          <TableCell>{checkVernis(entry.visuel)?.slice(0, 1)?.toUpperCase()}</TableCell>
          <TableCell>{entry.format_visu?.split("_").pop()}</TableCell>
          <TableCell>{entry.format_Plaque?.split("_").pop()}</TableCell>
          <TableCell className="job-ex-cell">
            <span className="job-ex">{entry.ex}</span>
            {entry.cut && (
              <span className="job-cut" title="Fichiers de découpe générés (.cut, .dxf, .svg)" aria-label="Avec découpe">
                <Icon name="cut" fitted />
              </span>
            )}
          </TableCell>

          {status === "jobs" ? (
            <TableCell>
              <Button
                compact
                size="mini"
                basic
                icon
                className="row-delete-btn job-delete"
                onClick={() => setConfirmDeleteId(entry.jobId)}
                disabled={onLoading}
                title="Supprimer ce job de la file"
                aria-label="Supprimer ce job de la file"
              >
                <Icon name="remove" fitted />
              </Button>
            </TableCell>
          ) : (
            <TableCell />
          )}
        </TableRow>
      );
    });
  };

  const ItemsJob = (status) => {
    const source = data?.[0]?.[status];
    const items = Array.isArray(source) ? source.filter(Boolean) : [];
    const allSelected = nbJobs > 0 && nbSelected === nbJobs;

    const body =
      status === "jobs" ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((job) => String(job._id))} strategy={verticalListSortingStrategy}>
            {items.map((value, i) => (
              <SortableJobGroup key={String(value._id)} id={String(value._id)}>
                {({ handleProps }) => renderJobRows(value, i, status, handleProps)}
              </SortableJobGroup>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        <TableBody className="body-table-jobs">{items.flatMap((value, i) => renderJobRows(value, i, status))}</TableBody>
      );

    const newTable = !isLoading && (
      <div className={`jobs-table-wrapper jobs-table-wrapper--${status === "jobs" ? "attente" : "traites"}`}>
        <div className="jobs-table-container">
        <Table size="small" compact columns={"12"} className="jobs-table" striped>
          <colgroup>
            <col style={{ width: "36px" }} />
            <col style={{ width: "36px" }} />
            <col style={{ width: "84px" }} />
            <col style={{ width: "96px" }} />
            <col style={{ width: "84px" }} />
            <col style={{ width: "170px" }} />
            <col style={{ width: "auto" }} />
            <col style={{ width: "64px" }} />
            <col style={{ width: "84px" }} />
            <col style={{ width: "84px" }} />
            <col style={{ width: "64px" }} />
            <col style={{ width: "44px" }} />
          </colgroup>
          <TableHeader className="sticky-header">
            <TableRow className="table-row">
              <TableHeaderCell />
              <TableHeaderCell className="job-control-cell">
                {status === "jobs" && (
                  <Checkbox
                    checked={allSelected}
                    indeterminate={nbSelected > 0 && !allSelected}
                    disabled={onLoading || nbJobs === 0}
                    onChange={(e, { checked }) => toggleAll(checked)}
                    aria-label="Tout sélectionner"
                    title="Tout sélectionner"
                  />
                )}
              </TableHeaderCell>
              <TableHeaderCell>Clients</TableHeaderCell>
              <TableHeaderCell>Dates</TableHeaderCell>
              <TableHeaderCell>Commandes</TableHeaderCell>
              <TableHeaderCell>Villes</TableHeaderCell>
              <TableHeaderCell>Visuels</TableHeaderCell>
              <TableHeaderCell>Vernis</TableHeaderCell>
              <TableHeaderCell>Formats</TableHeaderCell>
              <TableHeaderCell>Plaques</TableHeaderCell>
              <TableHeaderCell>Ex</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHeader>

          {/* BODY */}
          {body}

          {/* FOOTER */}
          {status === "jobs" && (
            <TableFooter className="sticky-footer">
              <TableRow>
                <TableHeaderCell colSpan="12" collapsing>
                  <div className="sticky-footer-content">
                    <div className="checkbox-footer">
                      {stickersOnly ? (
                        <Button
                          type="button"
                          positive
                          size="small"
                          compact
                          icon="file text"
                          content={nbSelected > 0 ? `Stickers de la sélection (${nbSelected})` : "Générer stickers"}
                          onClick={() => handleGenerateStickers()}
                          disabled={onLoading}
                        />
                      ) : (
                        <>
                          <Button
                            type="button"
                            primary
                            size="small"
                            compact
                            icon="send"
                            content={nbSelected > 0 ? `Lancer en session (${nbSelected})` : "Lancer en session"}
                            onClick={() => setApercuTauro({ mode: "session", ids: selectionPayload.ids })}
                            disabled={onLoading || nbJobs === 0}
                          />
                          <Button
                            type="button"
                            size="small"
                            compact
                            content={nbSelected > 0 ? `Lancer hors session (${nbSelected})` : "Lancer hors session"}
                            onClick={() => setApercuTauro({ mode: "hors-session", ids: selectionPayload.ids })}
                            disabled={onLoading || nbJobs === 0}
                          />
                        </>
                      )}

                      <Checkbox
                        label="Générer stickers seulement"
                        checked={stickersOnly}
                        toggle
                        disabled={onLoading}
                        onChange={(e, data) => setStickersOnly(data.checked)}
                      />
                    </div>

                    {nbJobs > 0 && <TotalEx file={totalFile} selection={totalSelection} />}

                    {queueStatus.concurrency !== null && (
                      <div className="concurrency-control" title="Nombre de jobs traités en parallèle">
                        <span className="concurrency-label">Parallèle</span>
                        <Dropdown
                          compact
                          selection
                          upward
                          options={CONCURRENCY_OPTIONS}
                          value={queueStatus.concurrency}
                          onChange={(e, { value }) => handleConcurrencyChange(value)}
                          aria-label="Nombre de jobs traités en parallèle"
                        />
                      </div>
                    )}
                  </div>
                </TableHeaderCell>
              </TableRow>
            </TableFooter>
          )}

          {status === "completed" && (
            <TableFooter className="sticky-footer">
              <TableRow>
                <TableHeaderCell colSpan="12" collapsing>
                  <div className="sticky-footer-content">
                    <Button
                      negative
                      size="small"
                      compact
                      icon="warning circle"
                      content="Vider l'historique"
                      disabled={onLoading || nbCompleted === 0}
                      onClick={() => setConfirmClearCompleted(true)}
                    />
                  </div>
                </TableHeaderCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        </div>
      </div>
    );

    return newTable;
  };

  const jobs = ItemsJob("jobs");
  const completed = ItemsJob("completed");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {!wsConnected && (
        <div
          style={{
            background: "var(--warning-soft)",
            color: "var(--warning)",
            padding: "4px 10px",
            fontSize: "0.85em",
            borderBottom: "1px solid var(--warning)",
          }}
        >
          ⚠ Temps réel déconnecté — reconnexion en cours…
        </div>
      )}
      {actionError && (
        <div
          style={{
            background: "var(--danger-soft)",
            color: "var(--danger)",
            padding: "4px 10px",
            fontSize: "0.85em",
            borderBottom: "1px solid var(--danger)",
            cursor: "pointer",
          }}
          onClick={() => setActionError(null)}
        >
          ✕ {actionError}
        </div>
      )}
      {repriseArret && <AlerteRepriseArret reprise={repriseArret} onVu={() => setRepriseArret(null)} />}
      {depotsEnAttente && (
        <AlerteDepotsEnAttente depots={depotsEnAttente} onReprise={() => setRefreshFlag((n) => n + 1)} />
      )}
      <div className="file-tabs" role="tablist" aria-label="File des jobs" onKeyDown={ongletsClavier}>
        <button
          type="button"
          role="tab"
          id="file-tab-attente"
          aria-selected={ongletFile === "attente"}
          aria-controls="file-panel"
          tabIndex={ongletFile === "attente" ? 0 : -1}
          className={`file-tab${ongletFile === "attente" ? " active" : ""}`}
          onClick={() => choisirOnglet("attente")}
        >
          En attente <span className="file-tab-count">{nbJobs}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="file-tab-traites"
          aria-selected={ongletFile === "traites"}
          aria-controls="file-panel"
          tabIndex={ongletFile === "traites" ? 0 : -1}
          className={`file-tab${ongletFile === "traites" ? " active" : ""}`}
          onClick={() => choisirOnglet("traites")}
        >
          Traités <span className="file-tab-count">{nbCompleted}</span>
          {nouveauxTraites > 0 && (
            <span className="tab-badge" title={`${nouveauxTraites} nouveau(x) depuis la dernière visite`}>
              +{nouveauxTraites}
            </span>
          )}
        </button>
      </div>
      <BarreProgression
        progression={progression.etat}
        recuA={progression.recuA}
        running={queueStatus.running || onLoading}
        paused={queueStatus.paused}
        detailsDe={detailsDe}
        onPauseReprise={handlePauseResume}
        onAnnuler={() => setConfirmCancelRun(true)}
        onAller={allerAuJob}
      />
      <div
        id="file-panel"
        role="tabpanel"
        aria-labelledby={`file-tab-${ongletFile}`}
        className="file-panel"
      >
        {ongletFile === "attente" ? jobs : completed}
      </div>

      <Confirm
        open={confirmDeleteId !== null}
        header="Supprimer ce job ?"
        content="Ce job sera retiré de la file en attente. Cette action est irréversible."
        confirmButton="Supprimer"
        cancelButton="Annuler"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          handleDeleteJob(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />

      <Confirm
        open={confirmClearCompleted}
        header="Vider l'historique des jobs traités ?"
        content={`${nbCompleted} job${nbCompleted > 1 ? "s" : ""} traité${nbCompleted > 1 ? "s" : ""} seront définitivement supprimés de l'historique.`}
        confirmButton="Vider"
        cancelButton="Annuler"
        onCancel={() => setConfirmClearCompleted(false)}
        onConfirm={() => {
          handleDeleteJobComplete();
          setConfirmClearCompleted(false);
        }}
      />

      {apercuTauro && (
        <ApercuSessionTauro
          open
          mode={apercuTauro.mode}
          ids={apercuTauro.ids}
          message={apercuTauro.message}
          finitionInitiale={apercuTauro.finition}
          relancerInitial={apercuTauro.relancer}
          tailleInitiale={apercuTauro.taille}
          onClose={() => setApercuTauro(null)}
          onLance={runJobsList}
        />
      )}

      <Confirm
        open={confirmCancelRun}
        header="Annuler le traitement ?"
        content="Les jobs non démarrés sont retirés du traitement et restent dans la file d'attente. Les jobs déjà en cours se terminent normalement."
        confirmButton="Annuler le traitement"
        cancelButton="Continuer"
        onCancel={() => setConfirmCancelRun(false)}
        onConfirm={() => {
          handleCancelRun();
          setConfirmCancelRun(false);
        }}
      />
    </div>
  );
}

JobsList.propTypes = {
  formatTauro: PropTypes.array,
  refreshToken: PropTypes.number,
  onPendingCountChange: PropTypes.func,
  onAlerteChange: PropTypes.func,
};

// App.jsx porte tout l'état du formulaire : sans memo, chaque frappe re-rendait toute la file.
const JobsListMemo = memo(JobsList);
export default JobsListMemo;
