import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function FormatDropdown({ data, isLoading, onSelectFormat, selectedFormat, error, enabled }) {
  const formatOptions = data
    .map((format, index) => ({
      text: format.name,
      value: format.path,
      key: index,
    }))
    .sort((a, b) => a.text.localeCompare(b.text));

  return (
    <Dropdown
      compact
      fluid
      disabled={enabled}
      error={error}
      id="format"
      className="format"
      loading={isLoading}
      floating
      selection
      placeholder="Format"
      value={selectedFormat}
      text={selectedFormat}
      options={formatOptions}
      onChange={(e, data) => {
        onSelectFormat(e, data);
      }}
    />
  );
}

FormatDropdown.propTypes = {
  data: PropTypes.array.isRequired,
  isLoading: PropTypes.bool.isRequired,
  selectedFormat: PropTypes.string,
  onSelectFormat: PropTypes.func.isRequired,
  error: PropTypes.bool,
  enabled: PropTypes.bool,
};

export default FormatDropdown;
