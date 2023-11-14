import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function FormatTauro({ onValue, formatTauro, isLoading, error }) {
  const formatOptions = formatTauro
    .map((value, index) => ({ key: index, text: value.split('_').pop(), value: value }))
    .sort();

  return (
    <Dropdown
      id="FormatTauro"
      clearable
      error={error}
      loading={isLoading}
      placeholder="Select folder"
      fluid
      selection
      options={formatOptions}
      onChange={(e, data) => {
        onValue(e, data);
      }}
    />
  );
}

FormatTauro.propTypes = {
  onValue: PropTypes.func,
  formatTauro: PropTypes.array,
  isLoading: PropTypes.bool,
  error: PropTypes.bool,
};

export default FormatTauro;
