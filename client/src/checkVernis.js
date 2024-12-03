const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function filterVerni(name) {
  let filtered = [''];

  const dataFetch = async () => {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/config/`, { method: 'GET' });
      const res = await response.json();
      filtered = res.vernis;
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };
  dataFetch();

  // S'assurer que name est une chaîne
  if (typeof name !== 'string') {
    console.error('Le paramètre "name" doit être une chaîne de caractères.');
    return;
  }

  // Vérifie si le nom contient un des éléments filtrés
  const find = filtered.find((el) => name.includes(el));

  if (find) {
    return find;
  } else {
    return;
  }
}

export default filterVerni;
