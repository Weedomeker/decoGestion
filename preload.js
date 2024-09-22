const { contextBridge } = require('electron');
const { isDev } = require('isDev');

contextBridge.exposeInMainWorld('isDev', isDev);
