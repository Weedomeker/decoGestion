import PropTypes from 'prop-types';
import { Embed } from 'semantic-ui-react';

function LouisPreview({ show }) {
  if (show) {
    return (
      <div className="preview-deco" style={{ width: '50%', paddingRight: '5%' }}>
        <Embed active url="http://localhost:8000/louis" />
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
