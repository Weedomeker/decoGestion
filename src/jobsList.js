function createJob(date, time, cmd, ville, format, formatPlaque, visuel, ex, visuPath, writePath, reg) {
  const newJob = {
    _id: Date.now(),
    date: date,
    time: time,
    cmd: parseInt(cmd),
    ville: ville,
    format_visu: format,
    format_Plaque: formatPlaque.split('_').pop(),
    visuel: visuel.replace(/\.[^/.]+$/, ''),
    ex: parseInt(ex),
    visuPath: visuPath,
    writePath: writePath,
    reg: reg,
  };
  return newJob;
}

module.exports = createJob;
