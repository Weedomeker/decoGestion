function Wastcut(distance = Number, espacement = Number, name = String) {
  let wastcut = [];
  let layers = [];
  if (name == undefined) name = '';
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
        console.log('decoupe en deux');
      } else {
        //Waste Top
        wastcut.push(
          `${name}Top${i}: new makerjs.paths.Line([${negative}${coupe * i}, widthPlate / 2], [${negative}${
            coupe * i
          }, decWidth / 2 + 0.6]),`,
        );
        layers.push(`model.models.wasteCut.paths.${name}Top${i}.layer = 'maroon';`);

        //Waste Bottom
        wastcut.push(
          `${name}Bottom${i}: new makerjs.paths.Line([${negative}${coupe * i}, -widthPlate / 2], [${negative}${
            coupe * i
          }, -decWidth / 2 - 0.6]),`,
        );
        layers.push(`model.models.wasteCut.paths.${name}Bottom${i}.layer = 'maroon';`);
      }
    }
  }
  console.log(wastcut.sort());
  console.log(layers.sort());
}

Wastcut(260, 80, 'v');
