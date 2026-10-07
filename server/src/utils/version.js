// Versions sémantiques X.Y.Z (préfixe "v" toléré). Partagé par le serveur (alerte de mise à jour,
// changelog) et par scripts/release.js — vit dans server/ car c'est ce qui est copié en prod.

function parseVersion(v) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? "").trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a, b) {
  const pa = parseVersion(a) || [0, 0, 0];
  const pb = parseVersion(b) || [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

function bumpVersion(v, level) {
  const parsed = parseVersion(v);
  if (!parsed) throw new Error(`Version invalide : ${v}`);
  const [major, minor, patch] = parsed;
  switch (level) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Niveau d'incrément inconnu : ${level}`);
  }
}

module.exports = { parseVersion, compareVersions, bumpVersion };
