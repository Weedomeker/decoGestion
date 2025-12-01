import PropTypes from "prop-types";
import { Message } from "semantic-ui-react";

const InfoMessage = ({ title, text, isHidden, icon, color }) => {
  return (
    <Message
      className="warning-message"
      negative
      color={color}
      size="tiny"
      icon={icon}
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
  icon: PropTypes.string,
  color: PropTypes.string,
};

export default InfoMessage;
