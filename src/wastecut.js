const makerjs = require('makerjs');
function Wastcut(distance = Number, espacement = Number, name) {
  let widthPlate = distance,
    decWidth = 100;
  let paths = {};
  let wastcut = [];
  let layers = [];
  if (name == undefined || name == null) name = '';
  let interval = distance / espacement;

  if (interval > 3) interval = Math.floor(interval);

  if (distance < espacement) {
    console.log('Pas besoin de Wastcut');
  } else {
    //Nbr de decoupes
    //console.log('Nbrs morceaux: ', interval);
    const coupe = parseFloat((distance / Math.round(interval)).toFixed(2));

    //Iteration decoupe par interval

    for (let i = 1; i < interval; i++) {
      let negative;
      i < 2 ? (negative = '-') : (negative = '');

      if (interval < 2) {
        //Coupe en 2 si moins de deux morceaux
        //Left
        paths[`${name}Left${i}`] = `new makerjs.paths.Line([-${distance / 2}, 0], [(-decHeight - 0.6) / 2, 0]),`;
        layers.push(`model.models.wasteCut.paths.${name}Left${i}.layer = 'maroon';`);
        //Right
        paths[`${name}Right${i}`] = `new makerjs.paths.Line([${distance / 2}, 0], [(decHeight + 0.6) / 2, 0]),`;
        layers.push(`model.models.wasteCut.paths.${name}Right${i}.layer = 'maroon';`);
      } else {
        //Waste Top
        (paths[`${name}Top${i}`] = new makerjs.paths.Line([`${negative}${coupe * i}`, widthPlate / 2], [`${negative}${coupe * i}`, decWidth / 2 + 0.6])),
          layers.push(`model.models.wasteCut.paths.${name}Top${i}.layer = 'maroon';`);

        //Waste Bottom
        (paths[`${name}Bottom${i}`] = new makerjs.paths.Line([`${negative}${coupe * i}`, -widthPlate / 2], [`${negative}${coupe * i}`, -decWidth / 2 - 0.6])),
          layers.push(`model.models.wasteCut.paths.${name}Bottom${i}.layer = 'maroon';`);
      }
    }
  }
  return { paths, layers };
}
module.exports = Wastcut;
