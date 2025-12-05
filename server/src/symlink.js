const fs = require("fs");
const path = require("path");
const logger = require("./logger/logger");

async function createSymlink(target, dir, pathUpdate) {
  fs.access(target, (err) => {
    if (pathUpdate) {
      fs.unlink(dir, (err) => {
        if (err) {
          logger.error(err);
        }
      });
    }
    if (!err) {
      fs.symlink(target, dir, (err) => {
        if (err) {
          if (err.code === "EEXIST") {
            logger.info("✔️  Symlink: " + err.dest);
          } else {
            logger.error(err);
          }
        } else {
          logger.info("Symlink Successfull: " + dir);
        }
      });
    } else {
      logger.error(err);
    }
  });
}

module.exports = createSymlink;
