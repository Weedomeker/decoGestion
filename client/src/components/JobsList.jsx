import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import {
  Button,
  ButtonContent,
  Checkbox,
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
import "./InfoModal";

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function JobsList({ show, formatTauro }) {
  const [data, setData] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [onLoading, setOnLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stickersOnly, setStickersOnly] = useState(false);
  // const [stickersData, setStickersData] = useState(true);
  // const [paperSticker, setPaperSticker] = useState('A4');
  const [filter, setFilter] = useState([]);

  useEffect(() => {
    if (data.length > 0) {
      const totalJobs = data[0].jobs.length + data[0].completed.length;
      if (totalJobs > 0) {
        setProgress((data[0].completed.length / totalJobs) * 100);
      }
    }
  }, [data]);

  useEffect(() => {
    const dataFetch = async () => {
      try {
        const response = await fetch(`http://${HOST}:${PORT}/jobs/`, { method: "GET" });
        const res = await response.json();
        setData([{ jobs: res.jobs, completed: res.completed }]);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    dataFetch();

    const ws = new WebSocket(`ws://${HOST}:${PORT}`);
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "update") {
        setRefreshFlag((prev) => !prev);
      }

      if (message.type === "start") {
        setStartTime(message.startTime);
        setOnLoading(true);
      }

      if (message.completedJob) {
        setData((prevData) => {
          const prev = prevData[0];

          // Toujours transformer recu en tableau
          const completedJobs = Array.isArray(message.completedJob) ? message.completedJob : [message.completedJob];

          // Ajouter les jobs complétés au tableau completed
          const updatedCompleted = [...prev.completed, ...completedJobs];

          // Supprimer ces jobs de la liste jobs
          const updatedJobs = prev.jobs.filter((job) => !completedJobs.some((cj) => cj._id === job._id));

          // Mise à jour de la progression
          const total = updatedCompleted.length + updatedJobs.length;
          const newProgress = (updatedCompleted.length / total) * 100;
          setProgress(newProgress);

          return [{ jobs: updatedJobs, completed: updatedCompleted }];
        });
      }

      if (message.type === "end") {
        setEndTime(message.endTime);
        setOnLoading(false);
        setProgress(100); // S'assurer que la barre affiche bien 100% à la fin
      }
    };

    ws.onclose = () => {
      console.log("Disconnected from WebSocket server");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, [show, refreshFlag]);

  useEffect(() => {
    const dataFetch = async () => {
      try {
        const response = await fetch(`http://${HOST}:${PORT}/config/`, { method: "GET" });
        const res = await response.json();
        setFilter(res.vernis);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    dataFetch();
  }, []);

  const handleGenerateStickers = async () => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/generate_stickers`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      });

      if (!response.ok) {
        console.error("Failed to generate stickers:", response.statusText);
        return;
      }

      console.log("Stickers generated successfully");
    } catch (error) {
      console.error("Error deleting jobs:", error);
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
      return;
    }
  };

  const runJobsList = async () => {
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
        console.error("Failed to run jobs:", response.statusText);
        return;
      }
      setRefreshFlag((prev) => !prev);
    } catch (error) {
      console.error("Error running jobs:", error);
    }
  };

  const handleDeleteJob = async (id) => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/delete_job`, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ _id: id }), // Envoie l'ID du job à supprimer
      });

      // Gestion de la réponse de suppression
      if (!response.ok) {
        console.error("Failed to delete job:", response.statusText);
        return;
      }

      console.log("Job deleted successfully");

      // Mise à jour de l'état après la suppression réussie
      const updateJobs = data[0].jobs.filter((item) => item._id !== id);

      setData((prevData) => [
        {
          ...prevData[0],
          jobs: updateJobs,
        },
      ]);
    } catch (error) {
      console.error("Error deleting job:", error);
    }
  };

  const handleDeleteJobComplete = async () => {
    setData((prevData) => [
      {
        ...prevData[0],
        completed: [],
      },
    ]);
    try {
      const response = await fetch(`http://${HOST}:${PORT}/delete_job_completed`, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });

      if (!response.ok) {
        console.error("Failed to delete all jobs:", response.statusText);
        return;
      }

      console.log("Jobs deleted successfully");
    } catch (error) {
      console.error("Error deleting jobs:", error);
    }
  };

  const ItemsJob = (status) => {
    const executionTime = startTime && endTime ? endTime - startTime : null;

    const newTableEntries = data?.[0]?.[status]?.flatMap((value, i) => {
      if (!value) return [];

      const baseEntry = {
        client: value.client,
        date: value.date,
        cmd: value.cmd,
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

      // Si CASTO → ajouter la deuxième ligne
      if (value.client === "CASTO" && value.visuel2) {
        entries.push({
          ...baseEntry,
          visuel: value.visuel2,
          jpgName: value.jpgName2,
          format_visu: value.format2_visu,
          ref: value.ref2,
        });
      }

      // Générer les lignes (1 pour LM, 2 pour CASTO)
      return entries.map((entry, idx) => {
        const title = entry.jpgName.split("/").pop();
        const url = `http://${HOST}:${PORT}/public/` + entry.jpgName.replace(/#/i, "%23");

        let visuelName = entry.visuel.split("/").pop();
        const regexFormat = visuelName.match(/\d{3}x\d{2,}/i);
        const regexRef = visuelName.match(/\d{8,}/);
        const cleanVisuelNameCasto = ["cred", "cm", regexFormat[0], regexRef[0], ".pdf", "mat", "brillant"];
        if (entry.client === "CASTO") {
          cleanVisuelNameCasto.map((el) => (visuelName = visuelName.toLowerCase().replace(el, "")));
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
            <TableCell>{entry.format_visu.split("_").pop()}</TableCell>
            <TableCell>{entry.format_Plaque.split("_").pop()}</TableCell>
            <TableCell>{entry.ex}</TableCell>
            <TableCell>{entry.cut ? <Icon name="cut" /> : null}</TableCell>

            {status === "jobs" ? (
              <TableCell>
                <Button
                  compact
                  size="mini"
                  color="grey"
                  onClick={() => handleDeleteJob(entry.jobId)}
                  disabled={onLoading}
                >
                  <Icon name="remove" fitted inverted />
                </Button>
              </TableCell>
            ) : (
              <TableCell />
            )}
          </TableRow>
        );
      });
    });

    const newTable = !isLoading && (
      <div className="jobs-table-container">
        <Table size="small" compact columns={"11"} className="jobs-table" striped>
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
              <TableHeaderCell />
            </TableRow>
          </TableHeader>

          {/* BODY */}
          <TableBody className="body-table-jobs">{newTableEntries}</TableBody>

          {/* FOOTERS IDENTIQUES À TA VERSION (je ne les ai pas touchés) */}
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
                            animated="fade"
                            size="small"
                            compact
                            onClick={() => handleGenerateStickers()}
                            disabled={onLoading}
                          >
                            <ButtonContent visible>
                              <Icon name="file text" inverted />
                            </ButtonContent>
                            <ButtonContent hidden content="Générer stickers" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            color="red"
                            animated="fade"
                            size="small"
                            compact
                            onClick={() => runJobsList()}
                            disabled={onLoading}
                          >
                            <ButtonContent visible>
                              <Icon name="send" inverted />
                            </ButtonContent>
                            <ButtonContent hidden content="Traiter la file" />
                          </Button>
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
                    <Button animated="fade" color="red" size="small" compact onClick={() => handleDeleteJobComplete()}>
                      <ButtonContent hidden content="Clear" />
                      <ButtonContent visible>
                        <Icon name="warning circle" />
                      </ButtonContent>
                    </Button>

                    {executionTime && data?.[0]?.jobs?.length === 0 && (
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
    );

    return newTable;
  };

  const jobs = ItemsJob("jobs");
  const completed = ItemsJob("completed");

  if (show) {
    return (
      <div className="preview-deco">
        {jobs}
        {completed}
      </div>
    );
  } else {
    return null;
  }
}

JobsList.propTypes = {
  show: PropTypes.bool,
  formatTauro: PropTypes.array,
};

export default JobsList;
