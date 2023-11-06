import PropTypes from 'prop-types';
import { Message, List } from 'semantic-ui-react';

function Log({ show, data }) {


  data.forEach((item, i) => {
    item.id = i + 1
  })

  const logTime = new Date().toLocaleTimeString('fr-FR')
  const options =
    data &&
    data.map((v) => {
      return (
     
        <Message.List key={v.id}>
         <div className='time'> {logTime}</div>
        <List.Icon name="check" color="green" />
          {v.value}
        </Message.List>
      );
    });

  if (show) {
    return (
      <div className="log">
          {options}
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
