function createJob(
  client,
  cmd,
  ville,
  format,
  format2,
  formatPlaque,
  visuel,
  visuel2,
  ref,
  ref2,
  ex,
  visuPath,
  visuPath2,
  writePath,
  jpgName,
  jpgName2,
  reg,
  cut,
  teinteMasse,
  perte,
) {
  const date = new Date();

  const newJob = {
    _id: Date.now(),
    date: date,
    client: client,
    cmd: parseInt(cmd),
    ville: ville,
    format_visu: format,
    format2_visu: format2,
    format_Plaque: formatPlaque.split("_").pop(),
    visuel: visuel,
    visuel2: visuel2,
    ref: parseInt(ref),
    ref2: parseInt(ref2),
    ex: parseInt(ex),
    visuPath: visuPath,
    visuPath2: visuPath2,
    writePath: writePath,
    jpgName: jpgName !== undefined ? jpgName.split("/").slice(2).join("/") + ".jpg" : "",
    jpgName2: jpgName2 !== undefined ? jpgName2.split("/").slice(2).join("/") + ".jpg" : "",
    reg: reg,
    cut: cut,
    teinteMasse: teinteMasse,
    perte: perte,
  };

  return newJob;
}

module.exports = createJob;
