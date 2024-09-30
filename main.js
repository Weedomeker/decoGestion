const { app, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log/main');
const { spawn } = require('child_process');

let serverProcess; // Variable pour stocker le processus du serveur
let tray = null;
const iconPath = path.join(process.resourcesPath, 'icon.ico');

log.initialize();
log.transports.file.resolvePathFn = () => path.join(__dirname, 'main.log');
log.info('Log from the main process');

console.log = log.log;

// Démarrer le serveur Express avec spawn
function startServer() {
  // Chemin pour localiser le fichier server.js
  let serverPath;

  if (process.env.NODE_ENV === 'development') {
    // En mode développement, le fichier est directement accessible
    serverPath = path.join(__dirname, 'server', 'server.js');
  } else {
    // En production, vérifier si le fichier est dans app.asar.unpacked
    serverPath = path.join(process.resourcesPath, 'server', 'server.js');
    // serverPath = path.join(__dirname, 'server', 'server.js');
  }

  console.log(`Chemin du script serveur : ${serverPath}`);
  if (!fs.existsSync(serverPath)) {
    console.error(`Le chemin du serveur est introuvable : ${serverPath}`);
    return;
  }

  const stdioConfig =
    process.env.NODE_ENV === 'development'
      ? 'inherit' // Affiche les logs du serveur dans la console en développement
      : ['pipe', 'pipe', 'pipe']; // Capture stdout/stderr en production

  const nodeExecPath = process.env.NODE_ENV === 'development' ? 'node' : process.execPath;

  // Lancer le serveur avec spawn
  serverProcess = spawn(nodeExecPath, [serverPath], {
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
    stdio: stdioConfig,
    detached: process.env.NODE_ENV === 'production',
  });

  if (process.env.NODE_ENV === 'production') {
    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });
    } else {
      console.log('serverProcess.stdout est null');
    }

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
      });
    } else {
      console.log('serverProcess.stderr est null');
    }
  }

  serverProcess.on('error', (err) => {
    console.log('Erreur lors du démarrage du serveur:', err);
  });

  serverProcess.on('close', (code) => {
    console.log(`Serveur Express arrêté avec le code : ${code}`);
  });
}

// Arrêter le serveur Express
function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM'); // Arrête le processus du serveur proprement
    console.log('Serveur Express arrêté.');
  }
}

// Démarrer l'application Electron et le serveur Express
app.on('ready', () => {
  startServer();

  const iconExists = fs.existsSync(iconPath);
  tray = new Tray(iconExists ? iconPath : './build/icon.ico');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir',
      click: () => {
        shell.openExternal('http://localhost:8000');
      },
    },
    {
      type: 'separator',
    },
    { label: 'Quitter', type: 'normal', role: 'quit' },
  ]);
  tray.setToolTip('Déco Gestion');
  tray.setContextMenu(contextMenu);

  tray.displayBalloon({
    title: 'Server démarré',
    content: `http://localhost:8000/`,
    iconType: 'none',
    respectQuietTime: true,
  });

  tray.on('balloon-click', (e) => {
    e.preventDefault();
    require('electron').shell.openExternal('http://localhost:8000');
  });
});

// Assurez-vous que le serveur est arrêté lors de la fermeture de l'application
app.on('will-quit', () => {
  stopServer(); // S'assurer que le serveur est bien arrêté
});
