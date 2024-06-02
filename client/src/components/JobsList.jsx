import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
  Button,
  Icon,
  Table,
  TableBody,
  TableCell,
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
      const res = await (await fetch(`http://${HOST}:${PORT}/jobs/`, { method: 'GET' })).json();

      setData([{ jobs: res.jobs, completed: res.completed }]);
      setLoading(false);
    };
    dataFetch();
  }, [show]);

  useEffect(() => {
    console.log(
      'DATA:',
      !isLoading &&
        data[0].jobs.map((el) => {
          if (el !== undefined && el !== null) {
            return el.ville;
          }
        }),
    );
  }, [data, isLoading]);

  const handleDeleteJob = (id) => {
    const updateJobs =
      !isLoading &&
      data[0].jobs
        .map((jobs) => jobs)
        .filter((item) => {
          return item._id !== id;
        });
    console.log('UPDATED: ', updateJobs);
    setData((prevData) => [
      {
        ...prevData[0],
        jobs: updateJobs,
      },
    ]);

    // POST data
    fetch(`http://${HOST}:${PORT}/delete_job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateJobs),
    }).catch((err) => console.log(err));
  };

  const ItemsJob = (status) => {
    status == 'jobs' ? status == 'jobs' : status == 'completed';

    const newTableEntries =
      !isLoading &&
      data[0][status].map((value, i) => {
        let visuel;
        if (value !== undefined && value !== null) {
          visuel = value.visuel;
        } else {
          return;
        }

        if (visuel === value.visuel && visuel !== undefined) {
          visuel = visuel.split('/').pop();
          visuel = visuel.split('-').pop();
          visuel = visuel.split(' ')[0];
        } else {
          return;
        }

        return (
          <TableRow key={i}>
            <TableCell>{value.date}</TableCell>
            <TableCell>{value.time}</TableCell>
            <TableCell>{value.cmd}</TableCell>
            <TableCell>{value.ville}</TableCell>
            <TableCell>{visuel}</TableCell>
            <TableCell>{value.format_visu}</TableCell>
            <TableCell>{value.format_Plaque.split('_').pop()}</TableCell>
            <TableCell>{value.ex}</TableCell>

            {status == 'jobs' ? (
              <TableCell>
                <Button
                  size="mini"
                  color="vk"
                  value={value._id}
                  onClick={() => handleDeleteJob(value._id)}
                >
                  <Icon name="remove" fitted inverted />
                </Button>
              </TableCell>
            ) : null}
          </TableRow>
        );
      });

    const newTable = !isLoading && (
      <Table celled inverted size="small" selectable compact className="jobslist">
        <TableHeader>
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
        {completed}
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
