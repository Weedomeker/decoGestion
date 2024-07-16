import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
  Button,
  ButtonContent,
  Icon,
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

  const runJobsList = async () => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/run_jobs`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ run: true, formatTauro: formatTauro }),
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
    if (isLoading || !data[0]) return null;
    const executionTime = startTime && endTime ? endTime - startTime : null;
    const newTableEntries = data[0][status].map((value, i) => {
      if (!value) return null;

      const visuel = value.visuel ? value.visuel.split('/').pop().split('-').pop().split(' ')[0] : '';
      const title = value.jpgName.split('/').pop();
      const url = `http://${HOST}:${PORT}/public/` + value.jpgName.replace(/#/i, '%23');

      return (
        <TableRow key={i} disabled={status === 'jobs' ? onLoading : null} className="table-row">
          <TableCell className="table-cell">
            {new Date(value.date).toLocaleString('fr-FR', { timeZone: 'EUROPE/PARIS' })}
          </TableCell>
          <TableCell className="table-cell">{value.cmd}</TableCell>
          <TableCell className="table-cell">{value.ville}</TableCell>
          <TableCell className="table-cell">
            {status === 'completed' ? (
              <a href={url} data-lightbox={title} data-title={title}>
                {visuel}
              </a>
            ) : (
              visuel
            )}
          </TableCell>
          <TableCell className="table-cell">{value.format_visu}</TableCell>
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
        <Table size="small" compact columns={'9'} className="jobs-table" striped>
          <TableHeader className="sticky-header">
            <TableRow className="table-row">
              <TableHeaderCell className="table-cell">Dates</TableHeaderCell>
              {/* <TableHeaderCell className="table-cell">Heures</TableHeaderCell> */}
              <TableHeaderCell className="table-cell">Commandes</TableHeaderCell>
              <TableHeaderCell className="table-cell">Villes</TableHeaderCell>
              <TableHeaderCell className="table-cell">Visuels</TableHeaderCell>
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
                <TableHeaderCell colSpan="9" collapsing>
                  <div className="sticky-footer-content">
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

                    {onLoading && <progress value={progress} max={100} className="progress" />}
                  </div>
                </TableHeaderCell>
              </TableRow>
            </TableFooter>
          )}
          {status === 'completed' && (
            <TableFooter className="sticky-footer">
              <TableRow className="table-row">
                <TableHeaderCell colSpan="9" collapsing>
                  <div className="sticky-footer-content">
                    <Button animated="fade" color="red" size="small" compact onClick={() => handleDeleteJobComplete()}>
                      <ButtonContent hidden content="Clear" />
                      <ButtonContent visible>
                        <Icon name="warning circle" />
                      </ButtonContent>
                    </Button>
                    {executionTime && (
                      <div>
                        {data[0].jobs.length === 0 ? (
                          <p>
                            Temps d&apos;exécution total:
                            {executionTime / 1000 > 60
                              ? (executionTime / 1000 / 60).toFixed(2) + ' min(s)'
                              : (executionTime / 1000).toFixed(2) + ' sec(s)'}
                          </p>
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
