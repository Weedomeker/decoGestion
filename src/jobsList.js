function createJob(cmd, ville, format, formatPlaque, visuel, ex, visuPath, writePath, jpgName, reg, cut, perte) {
  const date = new Date();

  const newJob = {
    _id: Date.now(),
    date: date,
    cmd: parseInt(cmd),
    ville: ville,
    format_visu: format,
    format_Plaque: formatPlaque.split('_').pop(),
    visuel: visuel,
    ex: parseInt(ex),
    visuPath: visuPath,
    writePath: writePath,
    jpgName: jpgName !== undefined ? jpgName.split('/').slice(2).join('/') + '.jpg' : '',
    reg: reg,
    cut: cut,
    perte: perte,
  };
  return newJob;
}

module.exports = createJob;
