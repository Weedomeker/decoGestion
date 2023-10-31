import PropTypes from 'prop-types';
import { Message } from 'semantic-ui-react';

const InfoMessage = ({ title, text, isHidden }) => {
  return (
    <Message
      className="warning-message"
      negative
      color="red"
      size="tiny"
      floating
      icon="warning sign"
      hidden={isHidden}
      header={title}
      content={text}
    />
  );
};

InfoMessage.propTypes = {
  title: PropTypes.string,
  text: PropTypes.string,
  isHidden: PropTypes.bool,
};

export default InfoMessage;
