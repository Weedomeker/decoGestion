import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function FormatTauro({ onValue, formatTauro, isLoading }) {
  formatTauro.sort();
  const formatOptions = formatTauro.map((value, index) => ({
    key: index,
    text: value.split('_').pop(),
    value: value,
  }));

  return (
    <Dropdown
      id="FormatTauro"
      clearable
      loading={isLoading}
      placeholder="Select folder"
      fluid
      selection
      options={formatOptions}
      onChange={(e, data) => {
        onValue(data);
      }}
    />
  );
}

FormatTauro.propTypes = {
  onValue: PropTypes.func,
  formatTauro: PropTypes.array,
  isLoading: PropTypes.bool,
};

export default FormatTauro;
