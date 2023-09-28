import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function VisuelDropdown({ files, isFile, onSelectedFile, selectedFile }) {
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
      fluid
      search
      selection
      value={selectedFile}
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
  selectedFile: PropTypes.string,
  onSelectedFile: PropTypes.func.isRequired,
};

export default VisuelDropdown;
