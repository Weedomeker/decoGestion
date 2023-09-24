import PropTypes from 'prop-types';
import { Embed } from 'semantic-ui-react';

function PreviewDeco({ fileSelected, show }) {
  if (fileSelected && show) {
    return (
      <div className="preview-deco">
        <Embed active url={'http://localhost:8000/public/' + fileSelected.split('/').slice(1).join('/')} />
      </div>
    );
  } else {
    return;
  }
}

PreviewDeco.propTypes = {
  fileSelected: PropTypes.string.isRequired,
  show: PropTypes.bool,
};

export default PreviewDeco;
