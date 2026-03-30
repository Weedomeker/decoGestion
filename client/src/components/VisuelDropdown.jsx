import PropTypes from "prop-types";
import { Dropdown } from "semantic-ui-react";

function filterName(name) {
  if (!name) return;
  let newName = name;

  if (name?.match(/\//g) && name?.match(/DIBOND \d{1,}x\d{1,}-/gi)) {
    let splitDibondName = name?.match(/DIBOND \d{1,}x\d{1,}-/gi);
    newName = name?.split(splitDibondName).pop();
  } else if (name?.match(/\//g)) {
    newName = name?.split("/").pop();
  } else {
    return;
  }

  // Supprimer l'extension .pdf si présente
  newName = newName?.replace(/\.pdf$/i, "");

  // Retirer les accents
  newName = newName?.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  //CASTO
  if (name.match(/CRED \d{2,}x\d{2,}/gi)) {
    newName = newName.split(/CRED \d{1,}x\d{1,}cm/gi).pop();
  }

  return newName;
}

function VisuelDropdown({ files, isFile, onSelectedFile, selectedFile, error, enabled }) {
  const filesOptions = files.map((file, index) => ({
    text: filterName(file?.name),
    value: file?.name,
    key: index,
  }));

  const handleChange = (e, data) => {
    if (data.value === null) {
      onSelectedFile(null);
      return;
    }
    const selectedFile = files.find((file) => file?.name === data.value);
    onSelectedFile(isFile ? selectedFile : null);
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
      value={selectedFile || null}
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
