import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function FormatDropdown({ data, isLoading, onSelectFormat, selectedFormat }) {
  const formatOptions = data.map((format, index) => ({
    text: format.name,
    value: format.path,
    key: index,
  }));

  return (
    <Dropdown
      id="format"
      className="format"
      loading={isLoading}
      floating
      selection
      placeholder="Format"
      value={selectedFormat}
      text={selectedFormat}
      options={formatOptions}
      onChange={(e, value) => {
        onSelectFormat(value);
      }}
    />
  );
}

FormatDropdown.propTypes = {
  data: PropTypes.array.isRequired,
  isLoading: PropTypes.bool.isRequired,
  selectedFormat: PropTypes.string,
  onSelectFormat: PropTypes.func.isRequired,
};

export default FormatDropdown;