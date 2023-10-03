const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import PropTypes from 'prop-types';
import { Embed } from 'semantic-ui-react';

function LouisPreview({ show }) {
  if (show) {
    return (
      <div className="preview-deco">
        <Embed active url={`http://${HOST}:${PORT}/louis`} />
      </div>
    );
  } else {
    return;
  }
}

LouisPreview.propTypes = {
  show: PropTypes.bool,
};

export default LouisPreview;
