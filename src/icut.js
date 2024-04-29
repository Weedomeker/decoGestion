const fs = require('fs');

function iCut(x, y) {
  const profil = 'Dibond 3mm';
  const layer = '';
  const header = `MGE i-cut script\n// Produced by Esko i-cut Layout 20.0.0 NT Jun  8 2020\nClear\nSystemUnits cm Local`;
  const cuttingKey = 'OpenCuttingKeyFor ' + profil;
  const selectLayer = 'SelectLayer ' + layer;
  const typeCurve = ['Open', 'Closed'];
  let reg = `Regmark + ${x},${y},Regmark`;
  let moveTo = `MoveTo ${x},${y},${typeCurve},${layer}`;
  let lineTo = `LineTo ${x},${y},Corner`;

  function Dec() {
    let x = [
      [0, 0],
      [200, 100],
      [200, 0],
      [0, 100],
    ];

    let y = [
      [200, 0],
      [0, 100],
      [200, 100],
      [0, 0],
    ];
    let dec = [
      header,
      'OpenCuttingKeyFor Dibond 3mm',
      'SelectLayer Dec',
      `MoveTo ${x[3][1]},${y[3][0]},Closed,Dec`,
    ];
    for (let i = 0; i < y.length; i++) {
      const xPos = x[i];
      const yPos = y[i];
      let lineTo = `LineTo ${xPos[1]},${yPos[0]},Corner`;
      dec.push(lineTo);
    }
    console.log(dec.join('\n'));
  }
  Dec();
}

iCut();
