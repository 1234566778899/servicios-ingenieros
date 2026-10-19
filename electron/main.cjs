const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let win;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function buildMenu() {
  const nav = (route) => () => send('navigate', route);
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nuevo servicio', accelerator: 'CmdOrCtrl+N', click: nav('/servicios/nuevo') },
        { type: 'separator' },
        { label: 'Cerrar sesión', click: () => send('logout') },
        isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' },
      ],
    },
    { label: 'Editar', role: 'editMenu' },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Servicios',
      submenu: [
        { label: 'Listado de servicios', accelerator: 'CmdOrCtrl+1', click: nav('/servicios') },
        { label: 'Nuevo servicio', click: nav('/servicios/nuevo') },
        { label: 'Equipos', accelerator: 'CmdOrCtrl+2', click: nav('/equipos') },
      ],
    },
    {
      label: 'Informes',
      submenu: [
        { label: 'Historial de informes', accelerator: 'CmdOrCtrl+3', click: nav('/historial') },
        { label: 'Plantillas de informe', click: nav('/historial/plantillas') },
      ],
    },
    {
      label: 'Herramientas',
      submenu: [
        { label: 'Usuarios', click: nav('/usuarios') },
        { label: 'Roles y permisos', click: nav('/roles') },
        { label: 'Catálogos y plantillas', click: nav('/catalogos') },
      ],
    },
    {
      label: 'Ayuda',
      role: 'help',
      submenu: [
        {
          label: 'Acerca de Nordico Informes',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'Nordico Informes',
              message: 'Nordico Ingenieros — Informes Técnicos de Servicios',
              detail: `Versión ${app.getVersion()}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Nordico Ingenieros — Informes Técnicos de Servicios',
    backgroundColor: '#fafafa',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // Los enlaces externos se abren en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// Convierte un HTML completo a PDF en una ventana oculta
ipcMain.handle('pdf:fromHtml', async (_e, html) => {
  const tmp = path.join(os.tmpdir(), `nordico-informe-${Date.now()}.html`);
  await fs.writeFile(tmp, html, 'utf8');
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWin.loadFile(tmp);
    const buf = await pdfWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    return new Uint8Array(buf);
  } finally {
    pdfWin.destroy();
    fs.unlink(tmp).catch(() => {});
  }
});

ipcMain.handle('file:save', async (_e, { name, data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('downloads'), name),
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, Buffer.from(data));
  return filePath;
});

ipcMain.handle('file:open', async (_e, { name, data }) => {
  const dir = path.join(app.getPath('temp'), 'nordico-informes');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, Buffer.from(data));
  const err = await shell.openPath(filePath);
  return err || null;
});

app.whenReady().then(() => {
  if (!DEV_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self'",
          ],
        },
      });
    });
  }
  // En desarrollo macOS muestra el ícono de Electron en el Dock; en el instalador lo pone electron-builder
  if (process.platform === 'darwin' && DEV_URL) app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png'));
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
