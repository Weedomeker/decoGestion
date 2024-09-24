const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let serverProcess; // Variable pour stocker le processus du serveur

// Créez la fenêtre Electron
function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Chargez votre app React avec le serveur Express
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:8000');
    console.log('DEV ENV');
  } else {
    win.loadURL('http://localhost:8000');
  }
  //win.setMenu(null);
  win.maximize();
}

// Démarrer le serveur Express avec spawn
function startServer() {
  // Chemin pour localiser le fichier server.js
  let serverPath;

  if (process.env.NODE_ENV === 'development') {
    // En mode développement, le fichier est directement accessible
    serverPath = path.join(__dirname, 'server', 'server.js');
  } else {
    // En production, vérifier si le fichier est dans app.asar.unpacked
    serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'server.js');
  }

  // Lancer le serveur avec spawn
  serverProcess = spawn('node', [serverPath], { stdio: 'inherit' });

  serverProcess.on('error', (err) => {
    console.error('Erreur lors du démarrage du serveur:', err);
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
app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Fermer l'application et arrêter le serveur quand toutes les fenêtres sont fermées
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServer(); // Fermer le serveur Express avant de quitter l'application
    app.quit();
  }
});

// Assurez-vous que le serveur est arrêté lors de la fermeture de l'application
app.on('will-quit', () => {
  stopServer(); // S'assurer que le serveur est bien arrêté
});
