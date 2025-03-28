import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function FormatTauro({ value, onValue, formatTauro, isLoading, error }) {
  const formatOptions = formatTauro
    .map((value, index) => ({ key: index, text: value.split('_').pop(), value: value }))
    .sort();
  return (
    <Dropdown
      id="FormatTauro"
      value={value}
      error={error}
      loading={isLoading}
      placeholder="Format Tauro"
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
  value: PropTypes.string,
  onValue: PropTypes.func,
  formatTauro: PropTypes.array,
  isLoading: PropTypes.bool,
  error: PropTypes.bool,
};

export default FormatTauro;
