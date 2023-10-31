import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

function VisuelDropdown({ files, isFile, onSelectedFile, selectedFile, error }) {
  const filesOptions = files.map((file, index) => ({
    text: file.name.split('-').pop(),
    value: file,
    key: index,
  }));
  return (
    <Dropdown
      error={error}
      id="visuel"
      clearable
      className="visuel"
      placeholder="Visuel"
      fluid
      search
      selection
      value={selectedFile !== undefined ? selectedFile : ''}
      text={selectedFile !== undefined ? selectedFile.split('-').pop() : ''}
      options={filesOptions}
      onChange={(e, data) => {
        const value = isFile && data.value;
        onSelectedFile(value);
      }}
    />
  );
}

VisuelDropdown.propTypes = {
  files: PropTypes.array,
  isFile: PropTypes.bool,
  selectedFile: PropTypes.string,
  onSelectedFile: PropTypes.func,
  error: PropTypes.bool,
};

export default VisuelDropdown;
