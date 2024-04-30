function iCut(arrCut) {
  const profil = 'Dibond 3mm';
  const layer = '';
  const header = `MGE i-cut script\n// Produced by Esko i-cut Layout 20.0.0 NT Jun  8 2020\nClear\nSystemUnits cm Local`;
  const cuttingKey = 'OpenCuttingKeyFor ' + profil;
  const selectLayer = 'SelectLayer ' + layer;
  const typeCurve = ['Open', 'Closed'];
  // let reg = `Regmark + ${x},${y},Regmark`;
  let dec = [
    header,
    'OpenCuttingKeyFor Dibond 3mm',
    'SelectLayer Dec',
    `MoveTo ${arrCut[3]},Closed,Dec`,
  ];
  for (let i = 0; i < arrCut.length; i++) {
    let lineTo = `LineTo ${arrCut[i]},Corner`;
    dec.push(lineTo);
  }
  console.log(dec.join('\n'));
}

module.exports = iCut;
