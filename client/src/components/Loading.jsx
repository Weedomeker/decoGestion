import PropTypes from 'prop-types';
import { Dimmer, Loader } from 'semantic-ui-react';

function Loading({ active }) {
  return (
    <Dimmer active={active}>
      <Loader indeterminate size="medium" inline="centered">
        En cours de créa ❤️
      </Loader>
    </Dimmer>
  );
}

Loading.propTypes = {
  active: PropTypes.bool.isRequired,
};

export default Loading;
