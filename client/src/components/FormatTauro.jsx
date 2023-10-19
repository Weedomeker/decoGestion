import PropTypes from 'prop-types';

import { Dropdown } from 'semantic-ui-react';

function FormatTauro({ onValue }) {
  const format = ['Deco_Std_100x205', 'Deco_Std_101x205', 'Deco_Std_125x250', 'Deco_Std_125x260', 'Deco_Std_150x305', 'Prod avec BLANC'];
  const formatOptions = format.map((value, index) => ({
    key: index,
    text: value.split('_').pop(),
    value: value,
  }));

  return (
    <Dropdown
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
};

export default FormatTauro;
