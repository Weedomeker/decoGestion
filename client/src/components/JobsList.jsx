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

  const handleRemoveJob = (e) => {
    const arr = [...data[0].jobs];
    const index = arr[e.target.value];

    if (index !== -1) {
      // const test = arr.splice(index, 1);
    }
    console.log(index);
  };

  const ItemsJob = (status) => {
    status == 'jobs' ? status == 'jobs' : status == 'completed';

    const newTableEntries =
      !isLoading &&
      data[0][status].map((value, i) => {
        return (
          <TableRow key={i}>
            <TableCell>{value.date}</TableCell>
            <TableCell>{value.time}</TableCell>
            <TableCell>{value.cmd}</TableCell>
            <TableCell>{value.ville}</TableCell>
            <TableCell>{value.visuel}</TableCell>
            <TableCell>{value.format_visu}</TableCell>
            <TableCell>{value.format_Plaque}</TableCell>
            <TableCell>{value.ex}</TableCell>

            {status == 'jobs' ? (
              <TableCell>
                <Button
                  size="mini"
                  color="vk"
                  value={i}
                  onClick={(e, data) => handleRemoveJob(e, data)}
                >
                  <Icon name="remove" fitted inverted />
                </Button>
              </TableCell>
            ) : null}
          </TableRow>
        );
      });

    const newTable = !isLoading && (
      <Table celled inverted size="small" compact selectable stackable sortable>
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
