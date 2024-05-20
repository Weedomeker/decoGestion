const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import PropTypes from 'prop-types';
import { Image } from 'semantic-ui-react';
import { useState } from 'react';

function ImageRender({ src, active }) {
  const [imageSourceUrl, setImageSourceUrl] = useState('');

  const fetchBlob = async (url) => {
    const res = await fetch(url, { method: 'GET' });
    if (res.ok) {
      return res.blob();
    } else {
      return;
    }
  };

  if (active) {
    const title = src.split('/').pop();
    const url = `http://${HOST}:${PORT}/public/` + src.replace(/#/i, '%23');

    const downloadImageAndSetSource = async (imageUrl) => {
      const image = await fetchBlob(imageUrl);
      setImageSourceUrl(URL.createObjectURL(image));
    };

    if (imageSourceUrl != imageSourceUrl) downloadImageAndSetSource(url);

    return (
      <div className="preview-deco">
        <a href={imageSourceUrl} data-lightbox={title} data-title={title}>
          <Image
            wrapped
            fluid
            centered
            verticalAlign="middle"
            src={imageSourceUrl}
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
