function Wastcut(distance = Number, espacement = Number, name = String) {
  if (name == undefined) name = '';

  const interval = distance / espacement;
  if (distance < espacement) {
    console.log('Pas besoin de Wastcut');
  } else {
    const coupe = parseFloat((distance / Math.round(interval)).toFixed(2));
    console.log('Nbrs morceaux: ', interval);
    for (let i = 1; i < interval; i++) {
      //console.log(`${name} ${i}: `, coupe * i);
      console.log(
        `${name}${i}: new makerjs.paths.Line([${coupe * i}, widthPlate / 2], [${coupe * i}, decWidth / 2 + 0.6]),`,
      );
    }
  }
}

Wastcut(200, 80, 'v');

// v3: new makerjs.paths.Line([decHeight / 3, widthPlate / 2], [decHeight / 3, decWidth / 2 + 0.6]),
