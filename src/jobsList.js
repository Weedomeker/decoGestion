function createJob(
  date,
  time,
  cmd,
  ville,
  format,
  formatPlaque,
  visuel,
  ex,
  visuPath,
  writePath,
  reg,
) {
  const newJob = {
    //  visuel.replace(/\.[^/.]+$/, '')
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
    reg: reg,
  };
  return newJob;
}

module.exports = createJob;
