import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
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
    console.log(data);
  }, [data]);

  const ItemsJob = (status) => {
    status == 'jobs' ? status == 'jobs' : status == 'completed';

    const newTableEntries =
      !isLoading &&
      data[0][status].map((x, i) => {
        return (
          <TableRow key={i}>
            {Object.values(x).map((value, i) => {
              return <TableCell key={i}>{value}</TableCell>;
            })}
          </TableRow>
        );
      });

    const newTableHeader =
      !isLoading &&
      data[0].jobs
        .map((x) => {
          return Object.keys(x).map((key, i) => {
            return <TableHeaderCell key={i}>{key}</TableHeaderCell>;
          });
        })
        .entries()
        .next().value[1];

    const newTable = !isLoading && (
      <Table celled inverted size="small" compact>
        <TableHeader>
          <TableRow>{newTableHeader}</TableRow>
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
      <div>
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
