const fs = require("fs/promises");
const path = require("path");
const logger = require("./logger/logger");

// Normalise un chemin UNC pour la comparaison (supprime les slashes finaux, casse ignorée sur Windows)
function normalizePath(p) {
  return p.replace(/[/\\]+$/, "").toLowerCase();
}

async function createSymlink(target, dir, pathUpdate) {
  // 1. Vérifier que la cible est accessible
  try {
    await fs.access(target);
  } catch {
    logger.error(`Symlink: cible inaccessible — ${target}`);
    return { ok: false, reason: "target_unreachable" };
  }

  // 2. Lire la cible actuelle du lien s'il existe
  let existingTarget = null;
  try {
    existingTarget = await fs.readlink(dir);
  } catch (e) {
    if (e.code !== "ENOENT") {
      // dir existe mais n'est pas un symlink (dossier ordinaire, etc.) — on ignore
    }
    // ENOENT = lien absent, on continue vers la création
  }

  // 3. Si le lien existe déjà et pointe vers la bonne cible → rien à faire
  if (existingTarget !== null && normalizePath(existingTarget) === normalizePath(target)) {
    logger.info(`Symlink ${pathUpdate ? "inchangé" : "déjà présent"}: ${path.basename(dir)}`);
    return { ok: true };
  }

  // 4. Si le lien existe mais avec une cible différente sans demande de mise à jour → laisser en place
  if (existingTarget !== null && !pathUpdate) {
    logger.warn(
      `Symlink ${path.basename(dir)}: cible actuelle différente de la config ` +
        `("${existingTarget}" ≠ "${target}") — conservé tel quel.`,
    );
    return { ok: true };
  }

  // 5. Si pathUpdate=true et cible différente : supprimer l'ancien lien avant de recréer
  if (existingTarget !== null && pathUpdate) {
    try {
      await fs.unlink(dir);
    } catch (e) {
      if (e.code !== "ENOENT") {
        logger.error(`Symlink: impossible de supprimer l'ancien lien — ${path.basename(dir)}: ${e.message}`);
        return { ok: false, reason: "unlink_failed" };
      }
    }
  }

  // 6. Créer le lien symbolique
  // 'dir' = symbolic link de répertoire — supporte les chemins UNC (\\server\share).
  // Requiert le mode Développeur Windows (Paramètres → Pour les développeurs → Mode développeur)
  // ou des droits administrateur. Utilisez `mklink /D` en admin pour une création ponctuelle.
  try {
    await fs.symlink(target, dir, "dir");
    logger.info(`Symlink créé: ${path.basename(dir)} → ${target}`);
    return { ok: true };
  } catch (e) {
    if (e.code === "EEXIST") {
      logger.info(`Symlink déjà présent: ${path.basename(dir)}`);
      return { ok: true };
    }
    if (e.code === "EPERM") {
      logger.error(
        `Symlink: droits insuffisants pour "${path.basename(dir)}". ` +
          `Activez le mode Développeur Windows (Paramètres → Pour les développeurs) ou lancez "npm run server" en admin.`,
      );
      return { ok: false, reason: "EPERM" };
    }
    logger.error(`Symlink: échec création — ${path.basename(dir)}: ${e.message}`);
    return { ok: false, reason: e.code };
  }
}

module.exports = createSymlink;
