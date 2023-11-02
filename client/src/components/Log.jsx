import PropTypes from 'prop-types';
import { Message, List } from 'semantic-ui-react';

function Log({ show, data }) {
  const logTime = new Date().toLocaleDateString('fr-FR');
  const options =
    data &&
    data.map((value, index) => {
      return (
        <Message.List key={index}>
          {' '}
          <List.Icon name="check" color="green" />
          {value}
        </Message.List>
      );
    });

  if (show) {
    return (
      <div className="preview-deco">
        <Message color="black" size="tiny">
          <Message.Header>Log session en cours: {logTime}</Message.Header>

          {options}
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
