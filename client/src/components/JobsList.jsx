import PropTypes from "prop-types";
import { useEffect, useState } from "react";
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
  Dropdown,
  Icon,
  Label,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "semantic-ui-react";
import "../css/JobsList.css";
import { API_BASE, WS_BASE } from "../utils/api";

const CONCURRENCY_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  key: i + 1,
  value: i + 1,
  text: String(i + 1),
}));

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

function JobsList({ formatTauro, refreshToken, onPendingCountChange }) {
  const [data, setData] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [onLoading, setOnLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stickersOnly, setStickersOnly] = useState(false);
  // const [stickersData, setStickersData] = useState(true);
  // const [paperSticker, setPaperSticker] = useState('A4');
  const [filter, setFilter] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmClearCompleted, setConfirmClearCompleted] = useState(false);
  const [confirmRunJobs, setConfirmRunJobs] = useState(false);
  const [confirmCancelRun, setConfirmCancelRun] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [queueStatus, setQueueStatus] = useState({ running: false, paused: false, concurrency: null });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (data.length > 0) {
      const totalJobs = data[0].jobs.length + data[0].completed.length;
      if (totalJobs > 0) {
        setProgress((data[0].completed.length / totalJobs) * 100);
      }
      onPendingCountChange?.(data[0].jobs.length);

      // La sélection ne garde que les jobs encore présents dans la file.
      const existing = new Set(data[0].jobs.map((job) => String(job._id)));
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => existing.has(id)));
        return next.size === prev.size ? prev : next;
      });
    }
  }, [data]);

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
        setStartTime(message.startTime);
        setOnLoading(true);
      }

      if (message.type === "queue") {
        setQueueStatus({ running: message.running, paused: message.paused, concurrency: message.concurrency });
        if (message.running) setOnLoading(true);
      }

      if (message.completedJob) {
        setData((prevData) => {
          const prev = prevData[0];
          if (!prev) return prevData;
          const completedJobs = Array.isArray(message.completedJob) ? message.completedJob : [message.completedJob];
          const updatedCompleted = [...prev.completed, ...completedJobs];
          const updatedJobs = prev.jobs.filter((job) => !completedJobs.some((cj) => cj._id === job._id));
          const total = updatedCompleted.length + updatedJobs.length;
          setProgress((updatedCompleted.length / total) * 100);
          return [{ jobs: updatedJobs, completed: updatedCompleted }];
        });
      }

      if (message.type === "end") {
        setEndTime(message.endTime);
        setOnLoading(false);
        setProgress(100);
        // Les jobs annulés ou en échec restent dans la file : resynchronisation.
        setRefreshFlag((prev) => prev + 1);
      }
    }

    let attempt = 0;
    const MAX_DELAY = 30000;

    function connect() {
      ws = new WebSocket(WS_BASE);
      ws.onopen = () => {
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
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    dataFetch();
  }, [refreshFlag, refreshToken]);

  // État de la file BullMQ au montage : restaure l'affichage d'un traitement en cours après un rechargement.
  useEffect(() => {
    const statusFetch = async () => {
      try {
        const response = await fetch(`${API_BASE}/queue/status`, { method: "GET" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();
        setQueueStatus({ running: status.running, paused: status.paused, concurrency: status.concurrency });
        if (status.running) setOnLoading(true);
      } catch (error) {
        console.error("Error fetching queue status:", error);
      }
    };
    statusFetch();
  }, []);

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
  const nbToRun = nbSelected > 0 ? nbSelected : nbJobs;
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

  const runJobsList = async () => {
    if (nbJobs === 0) return;
    const result = await queueAction(
      "/run_jobs",
      "POST",
      { run: true, formatTauro: formatTauro, ...selectionPayload },
      "Erreur traitement des jobs",
    );
    if (result) {
      setSelectedIds(new Set());
      setRefreshFlag((prev) => prev + 1);
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
        format_visu: value.format_visu,
        ref: value.ref,
      },
    ];
    // Si credences → ajouter la deuxième ligne
    if (value.format_visu && value.format_visu.match(/\d{3}x\d{2,}/i) && value.visuel2) {
      entries.push({
        ...baseEntry,
        cmd: value.cmd2,
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

      let visuelName = entry.visuel?.split("/")?.pop() ?? "";
      const regexFormat = visuelName.match(/\d{3}x\d{2,}/i);
      const regexRef = visuelName.match(/\d{8,}/);
      const cleanVisuelNameCasto = ["cred", "cm", regexFormat?.[0], regexRef?.[0], ".pdf", "mat", "brillant"].filter(
        Boolean,
      );
      if (entry.client === "CASTO") {
        cleanVisuelNameCasto.map((el) => (visuelName = visuelName.toLowerCase().replace(el, "")));
      }
      if (entry.client === "BRICO") {
        const regex = /^[A-Z]+-\d+$/;
        visuelName = visuelName.match(regex)?.[0] ?? visuelName;
        visuelName = visuelName.replace("BRILLANT", "").replace("MAT", "");
      }
      if (regexFormat && regexFormat[0]) {
        visuelName = visuelName.split(regexFormat[0])[0].toUpperCase();
      } else {
        visuelName = visuelName.toUpperCase();
      }

      const isFirstRow = idx === 0;
      const jobKey = String(entry.jobId);

      return (
        <TableRow
          key={`${i}-${idx}`}
          className="table-row"
          data-client={entry.client}
          style={value.teinteMasse ? { color: "#fc7703", fontWeight: "bold" } : null}
        >
          <TableCell className="job-control-cell">
            {status === "jobs" && isFirstRow && (
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
          <TableCell>{entry.client}</TableCell>
          <TableCell>{new Date(entry.date).toLocaleString("fr-FR", { timeZone: "EUROPE/PARIS" })}</TableCell>
          <TableCell>{entry.cmd}</TableCell>
          <TableCell>{entry.ville}</TableCell>

          <TableCell>
            {!stickersOnly && status === "completed" ? (
              <a href={url} data-lightbox={title} data-title={title}>
                {visuelName}
              </a>
            ) : (
              visuelName
            )}
          </TableCell>

          <TableCell>{checkVernis(entry.visuel)?.slice(0, 1)?.toUpperCase()}</TableCell>
          <TableCell>{entry.format_visu?.split("_").pop()}</TableCell>
          <TableCell>{entry.format_Plaque?.split("_").pop()}</TableCell>
          <TableCell>
            {entry.ex}
            {entry.cut ? <Icon name="cut" size="tiny" fitted style={{ marginLeft: "3px", opacity: 0.55 }} /> : null}
          </TableCell>

          {status === "jobs" ? (
            <TableCell>
              <Button
                compact
                size="mini"
                color="red"
                className="row-delete-btn"
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
    const executionTime = startTime && endTime ? endTime - startTime : null;

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
      <div className="jobs-table-wrapper">
        <div className="jobs-table-container">
        <Table size="small" compact columns={"12"} className="jobs-table" striped>
          <colgroup>
            <col style={{ width: "28px" }} />
            <col style={{ width: "32px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "auto" }} />
            <col style={{ width: "64px" }} />
            <col style={{ width: "70px" }} />
            <col style={{ width: "70px" }} />
            <col style={{ width: "48px" }} />
            <col style={{ width: "60px" }} />
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
                      {!onLoading &&
                        (stickersOnly ? (
                          <Button
                            type="button"
                            color="green"
                            size="small"
                            compact
                            icon="file text"
                            content={nbSelected > 0 ? `Stickers de la sélection (${nbSelected})` : "Générer stickers"}
                            onClick={() => handleGenerateStickers()}
                            disabled={onLoading}
                          />
                        ) : (
                          <Button
                            type="button"
                            color="red"
                            size="small"
                            compact
                            icon="send"
                            content={nbSelected > 0 ? `Traiter la sélection (${nbSelected})` : "Traiter la file"}
                            onClick={() => setConfirmRunJobs(true)}
                            disabled={onLoading || nbJobs === 0}
                          />
                        ))}

                      {!onLoading && (
                        <Checkbox
                          label="Générer stickers seulement"
                          checked={stickersOnly}
                          toggle
                          onChange={(e, data) => setStickersOnly(data.checked)}
                        />
                      )}

                      {onLoading && (
                        <Progress
                          value={Number.isNaN(progress) ? 0 : Math.round(progress)}
                          total={100}
                          color="blue"
                          size="medium"
                          progress
                          indicating
                        />
                      )}

                      {(queueStatus.running || queueStatus.paused) && (
                        <Button
                          type="button"
                          size="small"
                          compact
                          basic
                          icon={queueStatus.paused ? "play" : "pause"}
                          content={queueStatus.paused ? "Reprendre" : "Pause"}
                          onClick={handlePauseResume}
                          title={
                            queueStatus.paused
                              ? "Reprendre le traitement de la file"
                              : "Les jobs en cours se terminent, aucun nouveau job ne démarre"
                          }
                        />
                      )}

                      {queueStatus.running && (
                        <Button
                          type="button"
                          size="small"
                          compact
                          basic
                          color="red"
                          icon="stop"
                          content="Annuler"
                          onClick={() => setConfirmCancelRun(true)}
                          title="Retirer les jobs non démarrés du traitement"
                        />
                      )}

                      {queueStatus.paused && (
                        <Label size="small" color="orange" basic>
                          <Icon name="pause" /> En pause
                        </Label>
                      )}
                    </div>

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
                      color="red"
                      size="small"
                      compact
                      icon="warning circle"
                      content="Vider l'historique"
                      onClick={() => setConfirmClearCompleted(true)}
                    />

                    {executionTime && (data?.[0]?.jobs?.length ?? 0) === 0 && (
                      <pre>
                        Temps d&apos;exécution total:{" "}
                        {executionTime / 1000 > 60
                          ? (executionTime / 1000 / 60).toFixed(2) + " min(s)"
                          : (executionTime / 1000).toFixed(2) + " sec(s)"}
                      </pre>
                    )}
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
      <div className="jobs-section-label">File en attente ({nbJobs})</div>
      {jobs}
      {nbCompleted > 0 && (
        <div className="jobs-section-label jobs-section-label--completed">Traités ({nbCompleted})</div>
      )}
      {nbCompleted > 0 && completed}

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

      <Confirm
        open={confirmRunJobs}
        header={nbSelected > 0 ? "Traiter la sélection ?" : "Traiter la file ?"}
        content={`${nbToRun} job${nbToRun > 1 ? "s" : ""} ${nbSelected > 0 ? "sélectionné" + (nbToRun > 1 ? "s" : "") : "en attente"} vont être traités (génération PDF/découpe) dans l'ordre de la file. Cette opération peut prendre du temps.`}
        confirmButton="Traiter"
        cancelButton="Annuler"
        onCancel={() => setConfirmRunJobs(false)}
        onConfirm={() => {
          runJobsList();
          setConfirmRunJobs(false);
        }}
      />

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
};

export default JobsList;
