const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import PropTypes from 'prop-types';
import { Image } from 'semantic-ui-react';

function ImageRender({ src, active }) {
  if (active && src != undefined) {
    const title = src.split('/').pop();

    return (
      <div className="preview-deco">
        <a
          href={`http://${HOST}:${PORT}/public/` + src.replace(/#/i, '%23')}
          data-lightbox={title}
          data-title={title}
        >
          <Image
            wrapped
            fluid
            centered
            verticalAlign="middle"
            src={`http://${HOST}:${PORT}/public/` + src.replace(/#/i, '%23')}
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
