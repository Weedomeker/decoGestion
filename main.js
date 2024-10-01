const { app, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log/main');
const { spawn } = require('child_process');

let serverProcess;
let tray = null;
let isServerRunning = false; // Indique l'état du serveur

const iconPath = path.join(process.resourcesPath, 'icon.ico');
const serverOnlineIconPath = path.join(__dirname, 'build', 'server_online.png');
const serverOfflineIconPath = path.join(__dirname, 'build', 'server_offline.png');

// Fonction pour démarrer le serveur
function startServer() {
  // Définir le chemin du serveur en fonction de l'environnement
  const serverPath =
    process.env.NODE_ENV === 'development'
      ? path.join(__dirname, 'server', 'server.js')
      : path.join(process.resourcesPath, 'server', 'server.js');

  if (!fs.existsSync(serverPath)) {
    console.error(`Le chemin du serveur est introuvable : ${serverPath}`);
    return;
  }

  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => console.error('Erreur lors du démarrage du serveur:', err));
  serverProcess.on('close', (code, signal) => {
    console.log(`Serveur Express arrêté avec le code : ${code} signal: ${signal}`);
    isServerRunning = false;
    updateServerMenu(); // Met à jour le menu automatiquement à l'arrêt du serveur
  });

  isServerRunning = true;
  updateServerMenu(); // Met à jour le menu après le démarrage du serveur

  // tray.displayBalloon({
  //   title: 'Server démarré',
  //   content: `http://localhost:8000/`,
  //   iconType: 'none',
  //   respectQuietTime: true,
  // });
  // tray.on('balloon-click', (e) => {
  //   e.preventDefault();
  //   require('electron').shell.openExternal('http://localhost:8000');
  // });
}

// Fonction pour arrêter le serveur
function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM'); // Arrête le serveur proprement
    serverProcess = null;
    isServerRunning = false;
    updateServerMenu(); // Met à jour le menu après l'arrêt du serveur
  }
}

// Fonction pour mettre à jour le menu
function updateServerMenu() {
  const menuTemplate = [
    {
      label: 'Ouvrir le serveur',
      click: () => shell.openExternal('http://localhost:8000'),
    },
    {
      id: 'server-control',
      label: isServerRunning ? 'Arrêter le serveur' : 'Démarrer le serveur',
      icon: isServerRunning
        ? nativeImage.createFromPath(serverOnlineIconPath)
        : nativeImage.createFromPath(serverOfflineIconPath),
      click: () => {
        if (isServerRunning) {
          stopServer();
        } else {
          startServer();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quitter', role: 'quit' },
  ];

  // Mise à jour du menu du Tray
  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

// Démarrer l'application Electron
app.on('ready', () => {
  const iconExists = fs.existsSync(iconPath);
  const trayIcon = iconExists ? iconPath : path.join(__dirname, 'build', 'icon.ico');

  tray = new Tray(trayIcon);
  tray.setToolTip('Déco Gestion');

  updateServerMenu(); // Initialise le menu lors du démarrage de l'application
  startServer(); // Démarre le serveur automatiquement au démarrage de l'application
});

// Arrêter le serveur proprement lors de la fermeture de l'application
app.on('before-quit', () => {
  stopServer();
  tray.destroy();
});
