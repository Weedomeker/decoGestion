import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function FormatTauro({ onValue, formatTauro, isLoading }) {
  const formatOptions = formatTauro.map((value, index) => ({
    key: index,
    text: value,
    value: value,
  }));
  return (
    <Dropdown
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
