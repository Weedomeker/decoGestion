import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function VisuelDropdown({ files, isFile, selectedFile, onSelectedFile }) {
  const filesOptions = files.map((file, index) => ({
    text: file.split('-').pop(),
    value: file,
    key: index,
  }));
  return (
    <Dropdown
      id="visuel"
      className="visuel"
      placeholder="Visuel"
      value={selectedFile}
      fluid
      search
      selection
      options={filesOptions}
      onChange={(e, data) => {
        const value = isFile && data.value;
        onSelectedFile(value);
      }}
    />
  );
}

VisuelDropdown.propTypes = {
  files: PropTypes.array.isRequired,
  isFile: PropTypes.bool.isRequired,
  selectedFile: PropTypes.string.isRequired,
  onSelectedFile: PropTypes.func.isRequired,
};

export default VisuelDropdown;
