// Synchronisé avec client/src/components/DossierAutocomplete.jsx
// Ces fonctions pures sont dupliquées ici pour être requérables par Node.js/mocha
// sans avoir à transpiler le JSX.

const TEINTE_MASSE_OPTIONS = [
  "NOIR ZERO MAT",
  "BLANC ZERO MAT",
  "GRANIT 3 MAT",
  "ALU BROSSE",
  "BRONZE BROSSE",
  "CUIVRE BROSSE",
  "NOIR BROSSE",
  "OR BROSSE",
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function detectTeinteMasse(job) {
  const text = ` ${normalizeText(`${job.libelle || ""} ${job.reference || ""}`)} `;
  return (
    TEINTE_MASSE_OPTIONS.find((t) => {
      if (text.includes(` ${normalizeText(t)} `)) return true;
      // Les libellés DB peuvent omettre "MAT" (ex: "NOIR ZÉRO 100x255cm" au lieu de "NOIR ZERO MAT")
      // Pour les options à 3+ mots se terminant par "MAT", accepter aussi le préfixe sans "MAT"
      const words = t.split(" ");
      if (words[words.length - 1] === "MAT" && words.length >= 3) {
        return text.includes(` ${normalizeText(words.slice(0, -1).join(" "))} `);
      }
      return false;
    }) || null
  );
}

module.exports = { TEINTE_MASSE_OPTIONS, normalizeText, detectTeinteMasse };
