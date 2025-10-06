import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
  Button,
  ButtonContent,
  Checkbox,
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
} from 'semantic-ui-react';
import '../css/JobsList.css';
import './InfoModal';

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
  const [sortFolder, setSortFolder] = useState(false);
  const [stickersData, setStickersData] = useState(true);
  const [paperSticker, setPaperSticker] = useState('A4');
  const [filter, setFilter] = useState([]);

  useEffect(() => {
    if (data.length > 0) {
      const totalJobs = data[0].jobs.length + data[0].completed.length;
      if (totalJobs > 0) {
        setProgress((data[0].completed.length / totalJobs) * 100);
      }
    }
    console.log(data);
  }, [data]);

  useEffect(() => {
    const dataFetch = async () => {
      try {
        const response = await fetch(`http://${HOST}:${PORT}/jobs/`, { method: 'GET' });
        const res = await response.json();
        setData([{ jobs: res.jobs, completed: res.completed }]);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    dataFetch();

    const ws = new WebSocket(`ws://${HOST}:${PORT}`);
    ws.onopen = () => {
      console.log('Connected to WebSocket server');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'update') {
        setRefreshFlag((prev) => !prev);
      }

      if (message.type === 'start') {
        setStartTime(message.startTime);
        setOnLoading(true);
      }

      if (message.completedJob) {
        setData((prevData) => {
          const updatedCompleted = [...prevData[0].completed, message.completedJob];
          const updatedJobs = prevData[0].jobs.filter((job) => job._id !== message.completedJob._id);
          // Mise à jour de la progression
          const newProgress = (updatedCompleted.length / (updatedJobs.length + updatedCompleted.length)) * 100;
          setProgress(newProgress);
          return [{ jobs: updatedJobs, completed: updatedCompleted }];
        });
      }
      if (message.type === 'end') {
        setEndTime(message.endTime);
        setOnLoading(false);
        setProgress(100); // S'assurer que la barre affiche bien 100% à la fin
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from WebSocket server');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [show, refreshFlag]);

  useEffect(() => {
    const dataFetch = async () => {
      try {
        const response = await fetch(`http://${HOST}:${PORT}/config/`, { method: 'GET' });
        const res = await response.json();
        setFilter(res.vernis);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    dataFetch();
  }, []);

  const checkVernis = (value) => {
    value = value.toLowerCase();
    // S'assurer que value est une chaîne
    if (typeof value !== 'string') {
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
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run: true,
          formatTauro: formatTauro,
          sortFolder: sortFolder,
          stickersData: stickersData,
          paperSticker: paperSticker,
        }),
      });

      if (!response.ok) {
        console.error('Failed to run jobs:', response.statusText);
        return;
      }
      setRefreshFlag((prev) => !prev);
    } catch (error) {
      console.error('Error running jobs:', error);
    }
  };

  const handleDeleteJob = async (id) => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/delete_job`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: id }), // Envoie l'ID du job à supprimer
      });

      // Gestion de la réponse de suppression
      if (!response.ok) {
        console.error('Failed to delete job:', response.statusText);
        return;
      }

      console.log('Job deleted successfully');

      // Mise à jour de l'état après la suppression réussie
      const updateJobs = data[0].jobs.filter((item) => item._id !== id);

      setData((prevData) => [
        {
          ...prevData[0],
          jobs: updateJobs,
        },
      ]);
    } catch (error) {
      console.error('Error deleting job:', error);
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
        method: 'DELETE',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });

      if (!response.ok) {
        console.error('Failed to delete all jobs:', response.statusText);
        return;
      }

      console.log('Jobs deleted successfully');
    } catch (error) {
      console.error('Error deleting jobs:', error);
    }
  };

  const ItemsJob = (status) => {
    const executionTime = startTime && endTime ? endTime - startTime : null;
<<<<<<< HEAD
=======
    if (isLoading || !data?.[0]?.[status]) return null;
>>>>>>> dc408896bad6ad76ba197af2df43b13aa3c47235
    const newTableEntries = data?.[0]?.[status]?.map((value, i) => {
      if (!value) return null;

      let visuel = value.visuel ? value.visuel.split('/').pop() : '';
      const regexFormat = visuel.match(/\d{3}x\d{3}/i);
      if (regexFormat && regexFormat[0]) {
        visuel = visuel.split(regexFormat[0])[0].toUpperCase();
      } else {
        visuel = visuel.toUpperCase();
      }

      const title = value.jpgName.split('/').pop();
      let url = '';
      const ifSatin = checkVernis(value.jpgName) === '_S';
      if (checkVernis(value.jpgName) !== undefined && sortFolder) {
        url =
          `http://${HOST}:${PORT}/public/` +
          value.jpgName.split('/')[0] +
          '/' +
          value.jpgName.split('/')[1].replace(/#/i, '%23') +
          '/' +
          checkVernis(value.jpgName) +
          '/' +
          value.jpgName.split('/')[2];

        if (ifSatin) {
          url = url.replace('_S', 'Satin');
        }
      } else {
        url = `http://${HOST}:${PORT}/public/` + value.jpgName.replace(/#/i, '%23');
      }
      return (
        <TableRow
          key={i}
          disabled={status === 'jobs' ? onLoading : null}
          className="table-row"
          style={value.teinteMasse ? { color: '#fc7703', fontWeight: 'bold' } : null}
        >
          <TableCell className="table-cell">
            {new Date(value.date).toLocaleString('fr-FR', { timeZone: 'EUROPE/PARIS' })}
          </TableCell>
          <TableCell className="table-cell">{value.cmd}</TableCell>
          <TableCell className="table-cell">{value.ville}</TableCell>
          <TableCell className="table-cell ">
            {status === 'completed' ? (
              <a href={url} data-lightbox={title} data-title={title}>
                {visuel}
              </a>
            ) : (
              visuel
            )}
          </TableCell>
          <TableCell className="table-cell">{checkVernis(value?.visuel)?.slice(0, 1)?.toUpperCase()}</TableCell>
          <TableCell className="table-cell">{value.format_visu.split('_').pop()}</TableCell>
          <TableCell className="table-cell">{value.format_Plaque.split('_').pop()}</TableCell>
          <TableCell className="table-cell">{value.ex}</TableCell>
          <TableCell className="table-cell">{value.cut ? <Icon name="cut" /> : null}</TableCell>

          {status === 'jobs' ? (
            <TableCell className="table-cell ">
              <Button
                compact
                size="mini"
                color="grey"
                value={value._id}
                onClick={() => handleDeleteJob(value._id)}
                disabled={onLoading}
              >
                <Icon name="remove" fitted inverted />
              </Button>
            </TableCell>
          ) : (
            <TableCell className="table-cell " />
          )}
        </TableRow>
      );
    });

    const newTable = !isLoading && (
      <div className="jobs-table-container">
        <Table size="small" compact columns={'10'} className="jobs-table" striped>
          <TableHeader className="sticky-header">
            <TableRow className="table-row">
              <TableHeaderCell className="table-cell">Dates</TableHeaderCell>
              <TableHeaderCell className="table-cell">Commandes</TableHeaderCell>
              <TableHeaderCell className="table-cell">Villes</TableHeaderCell>
              <TableHeaderCell className="table-cell">Visuels</TableHeaderCell>
              <TableHeaderCell className="table-cell">Vernis</TableHeaderCell>
              <TableHeaderCell className="table-cell">Formats</TableHeaderCell>
              <TableHeaderCell className="table-cell">Plaques</TableHeaderCell>
              <TableHeaderCell className="table-cell">Ex</TableHeaderCell>
              <TableHeaderCell className="table-cell" />
              <TableHeaderCell className="table-cell" />
            </TableRow>
          </TableHeader>

          {/* BODY */}
          <TableBody className="body-table-jobs">{newTableEntries}</TableBody>

          {/* FOOTER */}
          {status === 'jobs' && (
            <TableFooter className="sticky-footer">
              <TableRow className="table-row">
                <TableHeaderCell colSpan="10" collapsing>
                  <div className="sticky-footer-content">
                    <div className="checkbox-footer">
                      {!onLoading && (
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
                      )}

                      {!onLoading && (
                        <Checkbox
                          label="Trier lasers texturé"
                          checked={sortFolder}
                          onChange={(e, data) => {
                            setSortFolder(data.checked);
                          }}
                        />
                      )}

                      {!onLoading && <Label>Papier stickers:</Label>}

                      {!onLoading && (
                        <Dropdown
                          value={paperSticker}
                          onChange={(e, data) => {
                            setPaperSticker(data.value);
                          }}
                          upward
                          compact
                          selection
                          options={[
                            { key: 'A5', text: 'A5', value: 'A5' },
                            { key: 'A4', text: 'A4', value: 'A4' },
                          ]}
                        />
                      )}

                      {!onLoading && (
                        <Checkbox
                          label="Étiquettes avec infos"
                          checked={stickersData}
                          onChange={(e, data) => {
                            setStickersData(data.checked);
                          }}
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
          {status === 'completed' && (
            <TableFooter className="sticky-footer">
              <TableRow className="table-row">
                <TableHeaderCell colSpan="10" collapsing>
                  <div className="sticky-footer-content">
                    <Button animated="fade" color="red" size="small" compact onClick={() => handleDeleteJobComplete()}>
                      <ButtonContent hidden content="Clear" />
                      <ButtonContent visible>
                        <Icon name="warning circle" />
                      </ButtonContent>
                    </Button>
                    {executionTime && (
                      <div>
                        {data?.[0]?.jobs?.length === 0 ? (
                          <pre>
                            Temps d&apos;exécution total:{' '}
                            {executionTime / 1000 > 60
                              ? (executionTime / 1000 / 60).toFixed(2) + ' min(s)'
                              : (executionTime / 1000).toFixed(2) + ' sec(s)'}
                          </pre>
                        ) : null}
                      </div>
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

  const jobs = ItemsJob('jobs');
  const completed = ItemsJob('completed');

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
