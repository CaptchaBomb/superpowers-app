import * as electron from "electron";
import * as i18n from "./shared/i18n";
import getPaths from "./getPaths";
import getLanguageCode from "./getLanguageCode";
import "./ipc";

let corePath: string;
let userDataPath: string;

let mainWindow: Electron.BrowserWindow;
let trayIcon: Electron.Tray;
let trayMenu: Electron.Menu;

let shouldQuit = false;


/* tslint:disable */
const expectedElectronVersion = require(`${__dirname}/package.json`).superpowers.electron;
/* tslint:enable */
const electronVersion = (process.versions as any).electron as string;

if (electronVersion !== expectedElectronVersion) {
  console.log(`WARNING: Running Electron v${electronVersion}, but expected v${expectedElectronVersion}.`);
}

if (electron.app.makeSingleInstance(restoreMainWindow)) { electron.app.quit(); process.exit(0); }
electron.app.on("ready", onAppReady);
electron.app.on("activate", () => { restoreMainWindow(); });
electron.app.on("before-quit", () => { shouldQuit = true;  });

electron.ipcMain.on("show-main-window", () => { restoreMainWindow(); });

function onAppReady() {
  electron.Menu.setApplicationMenu(null);

  getPaths((dataPathErr, pathToCore, pathToUserData) => {
    userDataPath = pathToUserData;
    corePath = pathToCore;

    getLanguageCode(userDataPath, (languageCode) => {
      i18n.languageCode = languageCode;
      i18n.load([ "startup", "tray" ], () => {
        if (dataPathErr != null) {
          electron.dialog.showErrorBox(i18n.t("startup:failedToStart"), i18n.t(dataPathErr.key, dataPathErr.variables));
          electron.app.quit();
          process.exit(1);
          return;
        }

        setupTrayOrDock();
        setupMainWindow();
      });
    });
  });
}

function setupTrayOrDock() {
  trayMenu = electron.Menu.buildFromTemplate([
    { label: i18n.t("tray:dashboard"), type: "normal", click: () => { restoreMainWindow(); } },
    { type: "separator" },
    { label: i18n.t("tray:exit"), type: "normal", click: () => { shouldQuit = true; electron.app.quit(); } }
  ]);

  // TODO: Insert 5 most recently used servers
  // trayMenu.insert(0, new electron.MenuItem({ type: "separator" }));
  // trayMenu.insert(0, new electron.MenuItem({ label: "My Server", type: "normal", click: () => {} }));

  if (process.platform !== "darwin") {
    trayIcon = new electron.Tray(`${__dirname}/icon-16.png`);
    trayIcon.setToolTip("Superpowers");
    trayIcon.setContextMenu(trayMenu);
    trayIcon.on("double-click", () => { restoreMainWindow(); });
  } else {
    electron.app.dock.setMenu(trayMenu);
  }
}

function setupMainWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1000, height: 600, icon: `${__dirname}/superpowers.ico`,
    minWidth: 800, minHeight: 480,
    useContentSize: true, autoHideMenuBar: true,
    show: false
  });
  mainWindow.loadURL(`file://${__dirname}/renderer/${i18n.getLocalizedFilename("index.html")}`);

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("init", corePath, userDataPath, i18n.languageCode);
    mainWindow.show();
  });

  mainWindow.webContents.on("will-navigate", (event: Event, newURL: string) => {
    event.preventDefault();
    electron.shell.openExternal(newURL);
  });

  mainWindow.on("close", onCloseMainWindow);
}

function onCloseMainWindow(event: Event) {
  if (shouldQuit) return;

  event.preventDefault();

  // NOTE: Minimize before closing to convey the fact
  // that the app is still running in the background
  mainWindow.minimize();
  setTimeout(() => { if (mainWindow.isMinimized()) mainWindow.hide(); }, 200);
}

function restoreMainWindow() {
  if (mainWindow == null) return true;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();

  return true;
}
