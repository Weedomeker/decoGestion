import PropTypes from 'prop-types';
import { Embed } from 'semantic-ui-react';

function PreviewDeco({ active, fileSelected }) {
  if (fileSelected) {
    return (
      <Embed active={!active} url={'http://localhost:8000/public/' + fileSelected.split('/').slice(1).join('/')} />
    );
  } else {
    return '';
  }
}

PreviewDeco.propTypes = {
  active: PropTypes.bool.isRequired,
  fileSelected: PropTypes.string.isRequired,
};

export default PreviewDeco;
