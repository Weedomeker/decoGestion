import PropTypes from 'prop-types';
import { Image } from 'semantic-ui-react';

function ImageRender({ src, active }) {
  if (active && src != undefined) {
    const title = src.split('/').pop();
    return (
      <div className="preview-deco">
        <a href={'http://localhost:8000/public/' + src.replace(/#/i, '%23')} data-lightbox={title} data-title={title}>
          <Image
            wrapped
            fluid
            centered
            verticalAlign="middle"
            src={'http://localhost:8000/public/' + src.replace(/#/i, '%23')}
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
