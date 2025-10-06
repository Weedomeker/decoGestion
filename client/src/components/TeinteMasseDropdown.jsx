import PropTypes from 'prop-types';
import { Dropdown } from 'semantic-ui-react';

const options = [
  { key: 'noir', text: 'NOIR ZERO MAT', value: 'NOIR ZERO MAT' },
  { key: 'blanc', text: 'BLANC ZERO MAT', value: 'BLANC ZERO MAT' },
  { key: 'granit3', text: 'GRANIT 3 MAT', value: 'GRANIT 3 MAT' },
];

const TeinteMasseDropdown = ({ selectedFile, onSelectedFile }) => {
  const handleChange = (e, data) => {
    onSelectedFile(data.value);
  };

  return (
    <Dropdown
      id="teinteMasse"
      clearable
      className="teinteMasse"
      name="teinteMasse"
      placeholder="Teinte Masse"
      fluid
      search
      selection
      options={options}
      value={selectedFile || ''}
      text={selectedFile}
      onChange={handleChange}
    />
  );
};

TeinteMasseDropdown.propTypes = {
  selectedFile: PropTypes.string,
  onSelectedFile: PropTypes.func.isRequired,
};

export default TeinteMasseDropdown;
