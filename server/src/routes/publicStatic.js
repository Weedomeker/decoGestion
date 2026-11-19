const path = require("path");
const express = require("express");

// Fichiers servis sous /public : uniquement le contenu de server/public.
// Le JPG d'un job arrive en /public/public/<session>/<nom>.jpg (jobsList.js), les aperçus en /public/PREVIEW.
// Ne jamais servir serverDir lui-même : code source et server.log seraient lisibles depuis le réseau.
function registerPublicStatic(app, serverDir) {
  const publicDir = path.join(serverDir, "public");
  app.use("/public/public", express.static(publicDir));
  app.use("/public/PREVIEW", express.static(path.join(publicDir, "PREVIEW")));
}

module.exports = registerPublicStatic;
