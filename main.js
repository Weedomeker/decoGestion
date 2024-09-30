const { app, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log/main');
const { spawn } = require('child_process');

let serverProcess; // Variable pour stocker le processus du serveur
let tray = null;
let contextMenu; // Déclaration ici pour être accessible partout
const iconPath = path.join(process.resourcesPath, 'icon.ico');
let isServerRunning = true; // Indicateur pour suivre l'état du serveur

log.initialize({ spyRendererConsole: true });
log.transports.file.resolvePathFn = () => path.join(__dirname, 'main.log');

console.log = log.log;

// Démarrer le serveur Express avec spawn
function startServer() {
  let serverPath;

  if (process.env.NODE_ENV === 'development') {
    serverPath = path.join(__dirname, 'server', 'server.js');
  } else {
    serverPath = path.join(process.resourcesPath, 'server', 'server.js');
  }

  console.log(`Chemin du script serveur : ${serverPath}`);
  if (!fs.existsSync(serverPath)) {
    console.error(`Le chemin du serveur est introuvable : ${serverPath}`);
    return;
  }

  const stdioConfig = process.env.NODE_ENV === 'development' ? 'inherit' : ['pipe', 'pipe', 'pipe'];

  const nodeExecPath = process.env.NODE_ENV === 'development' ? 'node' : process.execPath;

  // Lancer le serveur avec spawn
  serverProcess = spawn(nodeExecPath, [serverPath], {
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
    stdio: stdioConfig,
  });

  // Vérifie si serverProcess est défini avant d'accéder à stdout
  if (serverProcess) {
    // Capture de la sortie du serveur
    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });
    } else {
      console.log('Erreur : serverProcess.stdout est null');
    }

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
      });
    } else {
      console.log('Erreur : serverProcess.stderr est null');
    }

    serverProcess.on('error', (err) => {
      console.log('Erreur lors du démarrage du serveur:', err);
    });

    serverProcess.on('close', (code) => {
      console.log(`Serveur Express arrêté avec le code : ${code}`);
      isServerRunning = false; // Met à jour l'indicateur d'état
    });

    isServerRunning = true; // Met à jour l'indicateur d'état
    updateServerMenu();
  } else {
    console.log('Erreur : serverProcess est null après le spawn');
  }
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
}

// Arrêter le serveur Express
function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM'); // Arrête le processus du serveur proprement
    console.log('Serveur Express arrêté.');
    serverProcess = null; // Réinitialise le processus du serveur
    isServerRunning = false; // Met à jour l'indicateur d'état
    updateServerMenu();
  }
}

function updateServerMenu() {
  const updateMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir',
      click: () => {
        shell.openExternal('http://localhost:8000');
      },
    },
    {
      id: 'server-control', // Ajoute un ID pour cet élément du menu
      label: isServerRunning ? 'Arrêter le serveur' : 'Démarrer le serveur',
      click: () => {
        if (isServerRunning) {
          stopServer();
        } else {
          startServer();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quitter', type: 'normal', role: 'quit' },
  ]);
  tray.setContextMenu(updateMenu);
}

// Démarrer l'application Electron et le serveur Express
app.on('ready', () => {
  const iconExists = fs.existsSync(iconPath);
  tray = new Tray(iconExists ? iconPath : path.join(__dirname, 'build', 'icon.ico'));
  contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir',
      click: () => {
        shell.openExternal('http://localhost:8000');
      },
    },
    {
      id: 'server-control', // Ajoute un ID pour cet élément du menu
      label: 'Arrêter le serveur',
      click: () => {
        if (isServerRunning) {
          stopServer();
        } else {
          startServer();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quitter', type: 'normal', role: 'quit' },
  ]);
  tray.setToolTip('Déco Gestion');
  tray.setContextMenu(contextMenu);
  startServer();
});

// Assurez-vous que le serveur est arrêté lors de la fermeture de l'application
app.on('before-quit', () => {
  stopServer();
});
