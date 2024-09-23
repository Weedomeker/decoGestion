const { contextBridge } = require('electron');
const isDev = require('isdev');

contextBridge.exposeInMainWorld('isDev', isDev);
