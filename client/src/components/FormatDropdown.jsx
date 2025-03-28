import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function FormatDropdown({ data, isLoading, onSelectFormat, selectedFormat, error, enabled, placeholder = '' }) {
  const formatRegex = /\d{3}x\d{3}/i;

  const formatOptions = data
    ?.map((format, index) => {
      const match = format.name?.match(formatRegex)?.[0];
      return match
        ? {
            text: match,
            value: format.path,
            key: index,
          }
        : null;
    })
    .filter(Boolean) // Supprime les entrées où `match` est null
    .sort((a, b) => a.text.localeCompare(b.text));

  const selectedText = selectedFormat?.match(formatRegex)?.[0] || selectedFormat; // Affiche le format brut si pas de match
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
      placeholder={`Format ${placeholder}`}
      value={selectedFormat}
      text={selectedText}
      options={formatOptions}
      onChange={(e, data) => onSelectFormat(e, data)}
    />
  );
}

FormatDropdown.propTypes = {
  data: PropTypes.array,
  isLoading: PropTypes.bool.isRequired,
  selectedFormat: PropTypes.string,
  onSelectFormat: PropTypes.func.isRequired,
  error: PropTypes.bool,
  enabled: PropTypes.bool,
  placeholder: PropTypes.string,
};

export default FormatDropdown;
