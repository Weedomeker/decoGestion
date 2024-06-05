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

  const handleDeleteJob = async (id) => {
    const updateJobs = data[0].jobs.filter((item) => item._id !== id);

    setData((prevData) => [
      {
        ...prevData[0],
        jobs: updateJobs,
      },
    ]);

    try {
      const response = await fetch(`http://${HOST}:${PORT}/delete_job`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: id }), // Envoie l'ID du job à supprimer
      });

      if (!response.ok) {
        console.error('Failed to delete job:', response.statusText);
        return;
      }

      console.log('Job deleted successfully');
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
            <TableCell className="transparent-cell">
              <Button size="mini" color="vk" value={value._id} onClick={() => handleDeleteJob(value._id)}>
                <Icon name="remove" fitted inverted />
              </Button>
            </TableCell>
          ) : null}
        </TableRow>
      );
    });

    const newTable = !isLoading && (
      <Table celled size="small" compact inverted>
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
          </TableRow>
        </TableHeader>
        <TableBody>{newTableEntries}</TableBody>
        {status == 'completed' && (
          <TableFooter fullWidth>
            <TableRow>
              <TableHeaderCell verticalAlign="middle" colSpan="8" collapsing>
                <Button animated="fade" color="youtube" size="small" compact onClick={() => handleDeleteJobComplete()}>
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
