const makerjs = require('makerjs');

function Wastcut(widthPlate, heightPlate, decWidth, decHeight) {
  const espacement = 80;
  const fraise = 0.3;
  const paths = {};
  let layers = [];
  let interval = heightPlate / espacement;

  // Check debord plaque si wastecut necessaire
  const debordDecPlaque = parseFloat(widthPlate - decWidth) / 2;
  let wasteCutWidth = true;
  debordDecPlaque <= 1 ? (wasteCutWidth = false) : (wasteCutWidth = true);

  if (interval > 3) interval = Math.floor(interval);
  const coupe = parseFloat((heightPlate / Math.round(interval)).toFixed(2));

  if (heightPlate < espacement) {
    console.log('no waste');
  } else {
    //Left
    (paths[`Left`] = new makerjs.paths.Line([parseFloat(`${-heightPlate / 2}`), 0], [-decHeight / 2 - fraise, 0])),
      layers.push('Left');
    //Right
    (paths[`Right`] = new makerjs.paths.Line([parseFloat(`${heightPlate / 2}`), 0], [decHeight / 2 + fraise, 0])),
      layers.push('Right');

    //Iteration decoupe par interval
    for (let i = 1; i < interval; i++) {
      if (wasteCutWidth == true) {
        //Waste Top
        (paths[`Top${i}`] = new makerjs.paths.Line(
          [parseFloat(`${-heightPlate / 2 + coupe * i}`), widthPlate / 2],
          [parseFloat(`${-heightPlate / 2 + coupe * i}`), decWidth / 2 + fraise],
        )),
          layers.push(`Top${i}`);

        //Waste Bottom
        (paths[`Bottom${i}`] = new makerjs.paths.Line(
          [parseFloat(`${-heightPlate / 2 + coupe * i}`), -widthPlate / 2],
          [parseFloat(`${-heightPlate / 2 + coupe * i}`), -decWidth / 2 - fraise],
        )),
          layers.push(`Bottom${i}`);
      }
    }
  }
  return { paths, layers };
}
module.exports = Wastcut;
