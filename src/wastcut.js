function Wastcut(distance = Number, espacement = Number, name = String) {
  if (name == undefined) name = '';
  let interval = distance / espacement;

  if (interval > 3) interval = Math.floor(interval);

  if (distance < espacement) {
    console.log('Pas besoin de Wastcut');
  } else {
    //Nbr de decoupes
    console.log('Nbrs morceaux: ', interval);
    const coupe = parseFloat((distance / Math.round(interval)).toFixed(2));

    //Iteration decoupe par interval
    for (let i = 1; i < interval; i++) {
      if (interval < 2) {
        //Coupe en 2
        console.log(
          `${name}${i}: new makerjs.paths.Line([${coupe * i}, widthPlate / 2], [${coupe * i}, decWidth / 2 + 0.6]),`,
        );
      } else {
        // console.log(`${name} ${i}: `, coupe * i);
        console.log(
          `${name}${i}: new makerjs.paths.Line([${coupe * i}, widthPlate / 2], [${coupe * i}, decWidth / 2 + 0.6]),`,
        );
      }
    }
  }
}

Wastcut(260, 80, 'v');
Wastcut(100, 80, 'h');
