/**
 * Electron Main Process — FocusGuard desktop application entry point.
 * Security: contextIsolation=true, nodeIntegration=false, validated IPC.
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import path from "path";
import { registerIpcHandlers } from "./ipcHandlers";
import { setupTray } from "./tray";

// Force dark mode at OS level
nativeTheme.themeSource = "dark";

const isDev = process.env["NODE_ENV"] === "development";
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d0f14",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    show: false,
  });

  // Show window once ready to avoid white flash
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in system browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Handle renderer crashes gracefully
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[FocusGuard] Renderer process crashed:", details.reason);
  });

  if (isDev && VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, "../../dist/index.html")
    );
  }
}

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers(ipcMain);
  if (mainWindow) setupTray(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Prevent new window creation (security)
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "file:") {
      return;
    }
    const allowedOrigins = [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ];
    if (!allowedOrigins.includes(parsedUrl.origin)) {
      event.preventDefault();
    }
  });
});
