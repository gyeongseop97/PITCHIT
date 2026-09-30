const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pitchitDesktop', {
  getSettings: () => ipcRenderer.invoke('desktop-settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('desktop-settings:update', partial),
  resetSettings: () => ipcRenderer.invoke('desktop-settings:reset'),
  openSettings: () => ipcRenderer.send('desktop-settings:open'),
  onSettingsChanged: (listener) => {
    const callback = (_event, settings) => listener(settings);
    ipcRenderer.on('desktop-settings:changed', callback);
    return () => ipcRenderer.removeListener('desktop-settings:changed', callback);
  },
});
