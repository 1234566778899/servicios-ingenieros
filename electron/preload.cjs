const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  htmlToPdf: (html) => ipcRenderer.invoke('pdf:fromHtml', html),
  saveFile: (name, data) => ipcRenderer.invoke('file:save', { name, data }),
  openFile: (name, data) => ipcRenderer.invoke('file:open', { name, data }),
  onNavigate: (cb) => {
    const h = (_e, route) => cb(route);
    ipcRenderer.on('navigate', h);
    return () => ipcRenderer.removeListener('navigate', h);
  },
  onLogout: (cb) => {
    const h = () => cb();
    ipcRenderer.on('logout', h);
    return () => ipcRenderer.removeListener('logout', h);
  },
});
