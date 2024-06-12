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
const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function JobsList({ show }) {
  const [data, setData] = useState([]);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    const dataFetch = async () => {
      try {
        const res = await (await fetch(`http://${HOST}:${PORT}/jobs/`, { method: 'GET' })).json();
        setData([{ jobs: res.jobs, completed: res.completed }]);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    dataFetch();
  }, [show]);

  const runJobsList = async () => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/run_jobs`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ run: true }),
      });

      if (!response.ok) {
        console.error('Failed to run jobs:', response.statusText);
        return;
      }

      console.log('Jobs start successfully');

      // Recharger les données après l'exécution des tâches
      const res = await fetch(`http://${HOST}:${PORT}/jobs/`, { method: 'GET' });
      const jsonData = await res.json();

      console.log('Fetched jobs data after running jobs:', jsonData); // Ajout de journaux pour vérifier les données

      // Mise à jour de l'état après la suppression réussie
      setData([{ jobs: jsonData.jobs, completed: jsonData.completed }]);
    } catch (error) {
      console.error('Error running jobs:', error);
    }
  };

  const handleDeleteJob = async (id) => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/delete_job`, {
        method: 'POST',
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
        method: 'POST',
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

    const newTableEntries = data[0][status].map((value, i) => {
      if (!value) return null;

      const visuel = value.visuel ? value.visuel.split('/').pop().split('-').pop().split(' ')[0] : '';
      const title = value.jpgName.split('/').pop();
      const url = `http://${HOST}:${PORT}/public/` + value.jpgName.replace(/#/i, '%23');

      return (
        <TableRow key={i}>
          <TableCell>{value.date}</TableCell>
          <TableCell>{value.time}</TableCell>
          <TableCell>{value.cmd}</TableCell>
          <TableCell>{value.ville}</TableCell>
          <TableCell>
            {status == 'completed' ? (
              <a href={url} data-lightbox={title} data-title={title}>
                {visuel}
              </a>
            ) : (
              visuel
            )}
          </TableCell>
          <TableCell>{value.format_visu}</TableCell>
          <TableCell>{value.format_Plaque.split('_').pop()}</TableCell>
          <TableCell>{value.ex}</TableCell>

          {status == 'jobs' ? (
            <TableCell className="transparent-cell" width={'1'}>
              <Button compact size="mini" color="vk" value={value._id} onClick={() => handleDeleteJob(value._id)}>
                <Icon name="remove" fitted inverted />
              </Button>
            </TableCell>
          ) : null}
        </TableRow>
      );
    });

    const newTable = !isLoading && (
      <Table celled size="small" compact inverted columns={'9'}>
        <TableHeader fullWidth>
          <TableRow>
            <TableHeaderCell>Dates</TableHeaderCell>
            <TableHeaderCell>Heures</TableHeaderCell>
            <TableHeaderCell>Commandes</TableHeaderCell>
            <TableHeaderCell>Villes</TableHeaderCell>
            <TableHeaderCell>Visuels</TableHeaderCell>
            <TableHeaderCell>Formats</TableHeaderCell>
            <TableHeaderCell>Plaques</TableHeaderCell>
            <TableHeaderCell>Ex</TableHeaderCell>
            {status == 'completed' && <TableHeaderCell width={'1'} />}
          </TableRow>
        </TableHeader>
        <TableBody>{newTableEntries}</TableBody>
        {status == 'jobs' && (
          <TableFooter fullWidth>
            <TableRow>
              <TableHeaderCell verticalAlign="middle" colSpan="8" collapsing>
                <Button type="button" color="red" animated="fade" size="small" compact onClick={() => runJobsList()}>
                  <ButtonContent visible>
                    <Icon name="send" inverted />
                  </ButtonContent>
                  <ButtonContent hidden content="Traiter la file" />
                </Button>
              </TableHeaderCell>
            </TableRow>
          </TableFooter>
        )}
        {status == 'completed' && (
          <TableFooter fullWidth>
            <TableRow>
              <TableHeaderCell verticalAlign="middle" colSpan="8" collapsing>
                <Button animated="fade" color="red" size="small" compact onClick={() => handleDeleteJobComplete()}>
                  <ButtonContent hidden content="Clear" />
                  <ButtonContent visible>
                    <Icon name="warning circle" />
                  </ButtonContent>
                </Button>
              </TableHeaderCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    );

    return newTable;
  };
  const jobs = ItemsJob('jobs');
  const completed = ItemsJob('completed');

  if (show) {
    return (
      <div className="preview-deco">
        {jobs}
        {data[0].completed.length > 0 ? completed : null}
      </div>
    );
  } else {
    return;
  }
}

JobsList.propTypes = {
  show: PropTypes.bool,
};

export default JobsList;
