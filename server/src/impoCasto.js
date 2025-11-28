// Vérifie si un panneau rentre
function fits(w, h, plateW, plateH) {
  return w <= plateW && h <= plateH;
}

// Placement 1 panneau centré
function placeOne(plateW, plateH, w, h) {
  return [
    {
      x: (plateW - w) / 2,
      y: (plateH - h) / 2,
    },
  ];
}

// Placement 2 panneaux centrés horizontalement
function placeTwo(plateW, plateH, w1, h1, w2, h2, spacing = null) {
  let finalSpacing;

  if (spacing != null) {
    finalSpacing = spacing; // espacement fixe
  } else {
    finalSpacing = (plateW - (w1 + w2)) / 1; // espace entre les 2 panneaux
  }

  if (finalSpacing < 0) return null; // impossible

  const startX = (plateW - (w1 + w2 + finalSpacing)) / 2; // centre le groupe

  const y1 = (plateH - h1) / 2;
  const y2 = (plateH - h2) / 2;

  return [
    { x: startX, y: y1 },
    { x: startX + w1 + finalSpacing, y: y2 },
  ];
}

// Fonction principale pour placer les panneaux
function placePanels({ plateW, plateH, sizes, spacing }) {
  const count = sizes.length;

  if (count === 1) {
    const { w, h } = sizes[0];
    return placeOne(plateW, plateH, w, h);
  }

  if (count === 2) {
    const { w: w1, h: h1 } = sizes[0];
    const { w: w2, h: h2 } = sizes[1];

    return placeTwo(plateW, plateH, w1, h1, w2, h2, spacing);
  }

  return null; // pas géré pour >2 panneaux
}

module.exports = placePanels;
