// Nordico Informes (escritorio): ventana de Electron que abre la app web de producción,
// así cada despliegue en Vercel llega al escritorio sin reinstalar.
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('node:path');

const APP_URL = process.env.NORDICO_URL || 'https://servicios-ingenieros.vercel.app';
const APP_ORIGIN = new URL(APP_URL).origin;
const RETRY_URL = 'nordico://reintentar';
const EXT = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};
let win;

// Solo una instancia: abrir el acceso directo otra vez enfoca la ventana existente
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'Archivo', submenu: [{ role: 'quit', label: 'Salir' }] },
      { label: 'Editar', role: 'editMenu' },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload', label: 'Recargar' },
          { type: 'separator' },
          { role: 'resetZoom', label: 'Tamaño real' },
          { role: 'zoomIn', label: 'Acercar' },
          { role: 'zoomOut', label: 'Alejar' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
          { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        ],
      },
    ]),
  );
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: 'Nordico Informes',
    backgroundColor: '#fafafa',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // Sin conexión: pantalla con botón para reintentar
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !url.startsWith('file:')) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  win.on('closed', () => (win = null));
  win.loadURL(APP_URL);
}

app.on('web-contents-created', (_e, contents) => {
  // Las ventanas blob: son el informe para imprimir (PDF) o un archivo para abrir; el resto va al navegador
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 800, autoHideMenuBar: true } };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (url === RETRY_URL) {
      e.preventDefault();
      contents.loadURL(APP_URL);
    } else if (/^https?:/.test(url) && new URL(url).origin !== APP_ORIGIN) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
});

app.whenReady().then(() => {
  // Descargas: desde la ventana principal se elige dónde guardar (diálogo de Windows).
  // "Abrir" llega como una ventana blob aparte: se guarda en temporales, se abre con su programa
  // (Word, visor de PDF) y se cierra esa ventana vacía.
  session.defaultSession.on('will-download', (_e, item, contents) => {
    if (contents === win?.webContents) return;
    const hash = decodeURIComponent(new URL(item.getURL()).hash.slice(1));
    const name = path.basename(hash) || item.getFilename() + (EXT[item.getMimeType()] ?? '');
    const file = path.join(app.getPath('temp'), 'nordico-informes', name);
    item.setSavePath(file);
    item.once('done', (_ev, state) => {
      if (state === 'completed') shell.openPath(file);
      const child = BrowserWindow.fromWebContents(contents);
      if (child && child !== win && !child.isDestroyed()) child.close();
    });
  });
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
