
const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function log(message) {
  const file = path.join(app.getPath('userData'), 'updater.log');
  fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#080d18',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    window.loadURL('http://127.0.0.1:5173');
  }
}

function checkForUpdates() {
  if (!app.isPackaged) return;

  log(`Démarrage de la vérification. Version installée : ${app.getVersion()}`);

  autoUpdater.on('checking-for-update', () => {
    log('Vérification auprès de GitHub...');
  });

  autoUpdater.on('update-available', (info) => {
    log(`Mise à jour disponible : ${info.version}`);
  });

  autoUpdater.on('update-not-available', (info) => {
    log(`Aucune mise à jour. Version distante : ${info.version}`);
  });

  autoUpdater.on('error', async (error) => {
    log(`ERREUR : ${error.stack || error.message}`);
    await dialog.showMessageBox({
      type: 'error',
      title: 'Erreur de mise à jour',
      message: 'La recherche de mise à jour a échoué.',
      detail: error.message,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log(`Téléchargement terminé : ${info.version}`);

    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour disponible',
      message: `La version ${info.version} est téléchargée.`,
      detail: 'Redémarre le jeu pour installer la mise à jour.',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch((error) => {
    log(`ÉCHEC DE VÉRIFICATION : ${error.stack || error.message}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  setTimeout(checkForUpdates, 4000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
