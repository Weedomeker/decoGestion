const fs = require("fs");
const path = require("path");

async function browse(req, res) {
  const { path: dirPath } = req.query;

  if (!dirPath) {
    return res.status(400).json({ error: "Paramètre path manquant" });
  }

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    const parentPath = path.win32.dirname(dirPath);
    const parent = parentPath === dirPath ? null : parentPath;

    res.json({ current: dirPath, parent, dirs });
  } catch (err) {
    res.status(500).json({ error: `Impossible d'accéder à ce dossier : ${err.message}` });
  }
}

module.exports = { browse };
