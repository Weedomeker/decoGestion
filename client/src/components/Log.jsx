import PropTypes from 'prop-types';
import { Message } from 'semantic-ui-react';

function Log({ show, data }) {
  const logTime = new Date().toLocaleDateString('fr-FR');
  const options = data.map((el, index) => {
    return <Message.Item key={index}>{el}</Message.Item>;
  });

  if (show) {
    return (
      <div className="preview-deco">
        <Message color="black" size="tiny">
          <Message.Header>Log session en cours: {logTime}</Message.Header>
          <Message.List>{options}</Message.List>
        </Message>
      </div>
    );
  } else {
    return;
  }
}

Log.propTypes = {
  show: PropTypes.bool,
  data: PropTypes.array,
};

export default Log;
