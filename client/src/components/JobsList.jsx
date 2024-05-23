import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function JobsList({ show }) {
  const [data, setData] = useState([]);
  let jobs,
    completed = [];

  useEffect(() => {
    const dataFetch = async () => {
      const res = await (await fetch(`http://${HOST}:${PORT}/jobs/`, { method: 'GET' })).json();
      setData([...data, res]);
    };
    dataFetch();
  }, [data]);

  for (let i = 0; i < data.length; i++) {
    const v = data[i];
  }

  if (show) {
    return <div>{}</div>;
  } else {
    return;
  }
}

JobsList.propTypes = {
  show: PropTypes.bool,
};

export default JobsList;
