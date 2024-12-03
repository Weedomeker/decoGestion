const fs = require('fs');
const path = require('path');

function filterVerni(name) {
  let filtered = [];
  const configPath = path.join('./config.json');

  // Lire le fichier s'il existe
  if (fs.existsSync(configPath)) {
    const readFile = fs.readFileSync(configPath, 'utf8');
    try {
      filtered = JSON.parse(readFile).vernis;
    } catch (error) {
      return console.error(error);
    }
  }

  // S'assurer que name est une chaîne
  if (typeof name !== 'string') {
    console.error('Le paramètre "name" doit être une chaîne de caractères.');
    return;
  }

  // Vérifie si le nom contient un des éléments filtrés
  const find = filtered.find((el) => name.includes(el));

  if (find) {
    console.log('Vernis:', find);
    return find;
  } else {
    return;
  }
}

module.exports = filterVerni;
