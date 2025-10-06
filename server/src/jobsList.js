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
<<<<<<< HEAD
    teinteMasse,
=======
    teinteMasse: teinteMasse,
>>>>>>> dc408896bad6ad76ba197af2df43b13aa3c47235
    perte: perte,
  };

  return newJob;
}

module.exports = createJob;
