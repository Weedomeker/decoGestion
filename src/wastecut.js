const makerjs = require('makerjs');

function Wastcut(widthPlate, heightPlate, decWidth, decHeight, name) {
  const espacement = 80;
  const fraise = 2;
  let paths = {};
  let layers = [];
  if (name == undefined || name == null) name = '';
  let interval = heightPlate / espacement;
  if (interval > 3) interval = Math.floor(interval);

  if (heightPlate < espacement) {
    console.log('Pas besoin de Wastcut');
  } else {
    //Nbr de decoupes
    console.log('Nbrs morceaux: ', interval);
    const coupe = parseFloat((heightPlate / Math.round(interval)).toFixed(2));

    //Iteration decoupe par interval
    for (let i = 1; i < interval; i++) {
      let negative;
      i < 2 ? (negative = '-') : (negative = '');

      //Left
      (paths[`${name}Left${i}`] = new makerjs.paths.Line([parseFloat(`-${heightPlate / 2}`), 0], [(-decHeight - fraise) / 2, 0])),
        layers.push(`model.models.wasteCut.paths.${name}Left${i}.layer = 'maroon';`);
      //Right
      (paths[`${name}Right${i}`] = new makerjs.paths.Line([parseFloat(`${heightPlate / 2}`), 0], [(decHeight + fraise) / 2, 0])),
        layers.push(`model.models.wasteCut.paths.${name}Right${i}.layer = 'maroon';`);

      //Waste Top
      (paths[`${name}Top${i}`] = new makerjs.paths.Line([parseFloat(`${negative}${coupe * i}`), widthPlate / 2], [parseFloat(`${negative}${coupe * i}`), decWidth / 2 + fraise])),
        layers.push(`model.models.wasteCut.paths.${name}Top${i}.layer = 'maroon';`);

      //Waste Bottom
      (paths[`${name}Bottom${i}`] = new makerjs.paths.Line(
        [parseFloat(`${negative}${coupe * i}`), -widthPlate / 2],
        [parseFloat(`${negative}${coupe * i}`), -decWidth / 2 - fraise],
      )),
        layers.push(`model.models.wasteCut.paths.${name}Bottom${i}.layer = 'maroon';`);
    }
  }
  return { paths, layers };
}
module.exports = Wastcut;
