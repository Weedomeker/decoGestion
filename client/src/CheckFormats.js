function CheckFormats(format_Tauro, format_Visu) {
  let l_Tauro;
  let L_Tauro;
  let l_Visu;
  let L_Visu;

  if (format_Tauro !== '' || format_Tauro !== undefined) {
    const splitValue = format_Tauro.split('_').pop();
    l_Tauro = parseInt(splitValue.split('x').pop());
    L_Tauro = parseInt(splitValue.split('x').shift());
  } else {
    return;
  }

  if (format_Visu !== '' || format_Visu !== undefined) {
    const splitValue = format_Visu.split('_').pop();
    l_Visu = parseInt(splitValue.split('x').pop());
    L_Visu = parseInt(splitValue.split('x').shift());
  } else {
    return;
  }

  if (L_Visu > L_Tauro || l_Visu > l_Tauro) {
    return false;
  } else {
    return true;
  }
}

export default CheckFormats;
