const fs = require('fs');
const chalk = require('chalk');
const path = require('path');

const log = console.log;

async function createSymlink(target, dir) {
  fs.access(target, (err) => {
    if (!err) {
      fs.symlink(target, dir, (err) => {
        if (err) {
          if (err.code === 'EEXIST') {
            log('✔️ ', chalk.yellow('Symlink: '), err.dest);
          } else {
            log(chalk.red(err));
          }
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
