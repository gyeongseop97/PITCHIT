const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const GAME_URL = process.env.PITCHIT_DESKTOP_URL || 'https://pitchit-baseball.vercel.app/';
const DEFAULT_SETTINGS = Object.freeze({
  width: 720,
  height: 900,
  opacity: 1,
  alwaysOnTop: false,
});
const LIMITS = Object.freeze({
  minWidth: 420,
  maxWidth: 1800,
  minHeight: 580,
  maxHeight: 1800,
  minOpacity: 0.55,
  maxOpacity: 1,
});

let mainWindow = null;
let settingsWindow = null;
let settings = { ...DEFAULT_SETTINGS };
let boundsSaveTimer = null;

function boundedNumber(value, fallback, min, max, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const limited = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(limited) : Number(limited.toFixed(2));
}

function normalizeSettings(value = {}) {
  return {
    width: boundedNumber(value.width, DEFAULT_SETTINGS.width, LIMITS.minWidth, LIMITS.maxWidth, true),
    height: boundedNumber(value.height, DEFAULT_SETTINGS.height, LIMITS.minHeight, LIMITS.maxHeight, true),
    opacity: boundedNumber(value.opacity, DEFAULT_SETTINGS.opacity, LIMITS.minOpacity, LIMITS.maxOpacity),
    alwaysOnTop: Boolean(value.alwaysOnTop),
  };
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'window-settings.json');
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.warn('Unable to save PITCHIT desktop settings:', error);
  }
}

function notifySettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  settingsWindow.webContents.send('desktop-settings:changed', settings);
}

function applyWindowSettings({ resize = true } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (resize) {
    const [width, height] = mainWindow.getSize();
    if (width !== settings.width || height !== settings.height) {
      mainWindow.setSize(settings.width, settings.height);
    }
  }
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
  try {
    mainWindow.setOpacity(settings.opacity);
  } catch (_) {
    // Opacity is supported on Windows, but leaving the game usable is safer
    // on platforms that do not offer it.
  }
}

function updateSettings(partial = {}, options = {}) {
  settings = normalizeSettings({ ...settings, ...partial });
  applyWindowSettings(options);
  saveSettings();
  buildApplicationMenu();
  notifySettingsWindow();
  return settings;
}

function scheduleBoundsSave() {
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [width, height] = mainWindow.getSize();
    settings = normalizeSettings({ ...settings, width, height });
    saveSettings();
    notifySettingsWindow();
  }, 250);
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 430,
    height: 560,
    minWidth: 430,
    minHeight: 560,
    maxWidth: 430,
    maxHeight: 560,
    title: 'PITCHIT 창 설정',
    parent: mainWindow || undefined,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
}

function buildApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'PITCHIT',
      submenu: [
        { label: '창 설정…', accelerator: 'CommandOrControl+,', click: openSettings },
        {
          label: '항상 위에 표시',
          type: 'checkbox',
          checked: settings.alwaysOnTop,
          click: (item) => updateSettings({ alwaysOnTop: item.checked }, { resize: false }),
        },
        { type: 'separator' },
        { role: 'reload', label: '게임 새로고침' },
        { role: 'quit', label: 'PITCHIT 종료' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'togglefullscreen', label: '전체 화면 전환' },
        ...(process.env.NODE_ENV === 'development'
          ? [{ role: 'toggleDevTools', label: '개발자 도구' }]
          : []),
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: settings.width,
    height: settings.height,
    minWidth: LIMITS.minWidth,
    minHeight: LIMITS.minHeight,
    backgroundColor: '#071018',
    title: 'PITCHIT',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyWindowSettings({ resize: false });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('resize', scheduleBoundsSave);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // The game is remote so multiplayer, Google login, and API cookies remain
  // identical to the browser version. Child HTTPS windows cover OAuth flows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(GAME_URL);
}

ipcMain.handle('desktop-settings:get', () => settings);
ipcMain.handle('desktop-settings:update', (_event, partial) => {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return settings;
  return updateSettings(partial);
});
ipcMain.handle('desktop-settings:reset', () => updateSettings(DEFAULT_SETTINGS));
ipcMain.on('desktop-settings:open', openSettings);

app.whenReady().then(() => {
  app.setAppUserModelId('com.pitchit.baseball');
  settings = loadSettings();
  buildApplicationMenu();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
