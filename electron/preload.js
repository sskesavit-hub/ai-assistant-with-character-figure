const { contextBridge, ipcRenderer } = require('electron');

// Preload script to bridge Electron APIs safely
contextBridge.exposeInMainWorld('electronAPI', {
  setMiniMode: (isMini) => ipcRenderer.send('set-mini-mode', isMini)
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[Electron Preload] DOM loaded and script sandbox active.');
});
