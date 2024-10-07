const fs = require('fs');
const chalk = require('chalk');

const log = console.log;

function createSymlink(target, dir) {
  fs.access(target, (err) => {
    if (!err) {
      fs.symlink(target, dir, (err) => {
        if (err) {
          log(chalk.yellow('Symlink déjà existant: '), err.dest);
        } else {
          log(chalk.green('Symlink Successfull: '), dir);
        }
      });
    } else {
      log(err);
    }
  });
}

module.exports = createSymlink;
