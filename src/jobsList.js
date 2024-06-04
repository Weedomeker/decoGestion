function createJob(date, time, cmd, ville, format, formatPlaque, visuel, ex, visuPath, writePath, jpgName, reg) {
  const newJob = {
    _id: Date.now(),
    date: date,
    time: time,
    cmd: parseInt(cmd),
    ville: ville,
    format_visu: format,
    format_Plaque: formatPlaque,
    visuel: visuel,
    ex: parseInt(ex),
    visuPath: visuPath,
    writePath: writePath,
    jpgName: jpgName !== undefined ? jpgName.split('/').slice(2).join('/') + '.jpg' : '',
    reg: reg,
  };
  return newJob;
}

module.exports = createJob;
