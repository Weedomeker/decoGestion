function createJob(
  cmd,
  ville,
  format,
  formatPlaque,
  visuel,
  ref,
  ex,
  visuPath,
  writePath,
  jpgName,
  reg,
  cut,
  teinteMasse,
  perte,
) {
  const date = new Date();

  const newJob = {
    _id: Date.now(),
    date: date,
    cmd: parseInt(cmd),
    ville: ville,
    format_visu: format,
    format_Plaque: formatPlaque.split('_').pop(),
    visuel: visuel,
    ref: parseInt(ref),
    ex: parseInt(ex),
    visuPath: visuPath,
    writePath: writePath,
    jpgName: jpgName !== undefined ? jpgName.split('/').slice(2).join('/') + '.jpg' : '',
    reg: reg,
    cut: cut,
    teinteMasse: teinteMasse,
    perte: perte,
  };

  return newJob;
}

module.exports = createJob;
