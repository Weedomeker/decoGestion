const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import PropTypes from 'prop-types';
import { Image } from 'semantic-ui-react';
import { useEffect, useState } from 'react';

function ImageRender({ src, active }) {
  const title = src.split('/').pop();
  const url = `http://${HOST}:${PORT}/public/` + src.replace(/#/i, '%23');
  const [data, setData] = useState('');

  useEffect(() => {
    const dataFetch = async (url) => {
      const data = await (await fetch(url, { method: 'GET' })).blob();
      setData(URL.createObjectURL(data));
    };
    dataFetch(url);
  }, [url]);

  if (active) {
    return (
      <div className="preview-deco">
        <a href={data} data-lightbox={title} data-title={title}>
          <Image
            wrapped
            fluid
            centered
            verticalAlign="middle"
            src={data}
            alt={title}
          />
        </a>
      </div>
    );
  } else {
    return;
  }
}

ImageRender.propTypes = {
  src: PropTypes.string,
  active: PropTypes.bool,
};

export default ImageRender;
