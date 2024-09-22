const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = require('isDev');
const server = require('./server/server');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    console.log('DEV');
  } else {
    mainWindow.loadURL('http://localhost:8000');
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
