import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Confirm,
  Icon,
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

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

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

  useEffect(() => {
    if (data.length > 0) {
      const totalJobs = data[0].jobs.length + data[0].completed.length;
      if (totalJobs > 0) {
        setProgress((data[0].completed.length / totalJobs) * 100);
      }
      onPendingCountChange?.(data[0].jobs.length);
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
      }
    }

    let attempt = 0;
    const MAX_DELAY = 30000;

    function connect() {
      ws = new WebSocket(`ws://${HOST}:${PORT}`);
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
        const response = await fetch(`http://${HOST}:${PORT}/jobs/`, { method: "GET" });
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

  useEffect(() => {
    const dataFetch = async () => {
      try {
        const response = await fetch(`http://${HOST}:${PORT}/config/`, { method: "GET" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const res = await response.json();
        setFilter(res.vernis);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    dataFetch();
  }, []);

  const handleGenerateStickers = async () => {
    setActionError(null);
    try {
      const response = await fetch(`http://${HOST}:${PORT}/generate_stickers`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setActionError(result.error || `Erreur génération stickers (${response.status})`);
      }
    } catch (error) {
      console.error("Error generating stickers:", error);
      setActionError("Impossible de contacter le serveur.");
    }
  };

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
    setActionError(null);
    try {
      const response = await fetch(`http://${HOST}:${PORT}/run_jobs`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          run: true,
          formatTauro: formatTauro,
          // sortFolder: sortFolder,
          // stickersData: stickersData,
          // paperSticker: paperSticker,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setActionError(result.error || `Erreur traitement des jobs (${response.status})`);
        return;
      }
      setRefreshFlag((prev) => prev + 1);
    } catch (error) {
      console.error("Error running jobs:", error);
      setActionError("Impossible de contacter le serveur.");
    }
  };

  const handleDeleteJob = async (id) => {
    setActionError(null);
    try {
      const response = await fetch(`http://${HOST}:${PORT}/delete_job`, {
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
      const updateJobs = data[0].jobs.filter((item) => item._id !== id);
      setData((prevData) => [{ ...prevData[0], jobs: updateJobs }]);
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
      const response = await fetch(`http://${HOST}:${PORT}/delete_job_completed`, {
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

  const ItemsJob = (status) => {
    const executionTime = startTime && endTime ? endTime - startTime : null;

    const source = data?.[0]?.[status];
    const newTableEntries = Array.isArray(source)
      ? source.flatMap((value, i) => {
          if (!value) return [];

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
            const url = `http://${HOST}:${PORT}/public/` + entry.jpgName.replace(/#/i, "%23");

            let visuelName = entry.visuel?.split("/")?.pop() ?? "";
            const regexFormat = visuelName.match(/\d{3}x\d{2,}/i);
            const regexRef = visuelName.match(/\d{8,}/);
            const cleanVisuelNameCasto = [
              "cred",
              "cm",
              regexFormat?.[0],
              regexRef?.[0],
              ".pdf",
              "mat",
              "brillant",
            ].filter(Boolean);
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

            return (
              <TableRow
                key={`${i}-${idx}`}
                disabled={status === "jobs" ? onLoading : null}
                className="table-row"
                data-client={entry.client}
                style={value.teinteMasse ? { color: "#fc7703", fontWeight: "bold" } : null}
              >
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
        })
      : [];

    const newTable = !isLoading && (
      <div className="jobs-table-wrapper">
        <div className="jobs-table-container">
        <Table size="small" compact columns={"10"} className="jobs-table" striped>
          <colgroup>
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
          <TableBody className="body-table-jobs">{newTableEntries}</TableBody>

          {/* FOOTER */}
          {status === "jobs" && (
            <TableFooter className="sticky-footer">
              <TableRow>
                <TableHeaderCell colSpan="10" collapsing>
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
                            content="Générer stickers"
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
                            content="Traiter la file"
                            onClick={() => setConfirmRunJobs(true)}
                            disabled={onLoading}
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
                    </div>
                  </div>
                </TableHeaderCell>
              </TableRow>
            </TableFooter>
          )}

          {status === "completed" && (
            <TableFooter className="sticky-footer">
              <TableRow>
                <TableHeaderCell colSpan="10" collapsing>
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

  const nbJobs = data?.[0]?.jobs?.length ?? 0;
  const nbCompleted = data?.[0]?.completed?.length ?? 0;

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
        header="Traiter la file ?"
        content={`${nbJobs} job${nbJobs > 1 ? "s" : ""} en attente vont être traités (génération PDF/découpe). Cette opération peut prendre du temps.`}
        confirmButton="Traiter"
        cancelButton="Annuler"
        onCancel={() => setConfirmRunJobs(false)}
        onConfirm={() => {
          runJobsList();
          setConfirmRunJobs(false);
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
