import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function VisuelDropdown({ files, isFile, onSelectedFile, selectedFile, error, enabled }) {
  const filesOptions = files.map((file, index) => ({
    text: file.name.split('-').pop(),
    value: file.name,
    key: index,
  }));

  const handleChange = (e, data) => {
    const selectedFile = files.find((file) => file.name === data.value);
    const value = isFile ? selectedFile : '';
    onSelectedFile(value);
  };

  return (
    <Dropdown
      disabled={enabled}
      error={error}
      id="visuel"
      clearable
      className="visuel"
      name="visuel"
      placeholder="Visuel"
      fluid
      search
      selection
      value={selectedFile || ''}
      text={selectedFile ? selectedFile.split('-').pop() : ''}
      options={filesOptions}
      onChange={handleChange}
    />
  );
}

VisuelDropdown.propTypes = {
  files: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
    }),
  ).isRequired,
  isFile: PropTypes.bool,
  selectedFile: PropTypes.string,
  onSelectedFile: PropTypes.func.isRequired,
  error: PropTypes.bool,
  enabled: PropTypes.bool,
};

export default VisuelDropdown;
