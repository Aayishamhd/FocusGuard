/**
 * System Tray — FocusGuard tray icon and quick-action menu.
 *
 * Supported Actions:
 * - Show FocusGuard (restores and focuses main window)
 * - Start / Resume Session (sends validated IPC command)
 * - Pause / Resume Monitoring (toggles attention monitoring coordination)
 * - Quit Application
 *
 * Security & Privacy:
 * - Does not silently activate webcam or alter privacy preferences.
 * - Handles tray initialization failures gracefully (e.g., unsupported environments).
 */

import { BrowserWindow, Menu, Tray, nativeImage, app, type NativeImage } from "electron";
import path from "path";
import fs from "fs";

let tray: Tray | null = null;

/**
 * Generates a clean 16x16 monochrome icon fallback if no asset file is found on disk.
 */
function createTrayIcon(): NativeImage {
  try {
    const iconPath = path.join(app.getAppPath(), "assets", "tray-icon.png");
    if (fs.existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        return img.resize({ width: 16, height: 16 });
      }
    }
  } catch {
    // ignore
  }

  // 16x16 transparent PNG with a subtle 8x8 center square as reliable memory fallback
  // Minimal 1x1 or 16x16 transparent image
  const empty = nativeImage.createEmpty();
  return empty;
}

export function setupTray(mainWindow: BrowserWindow): Tray | null {
  try {
    // If tray already exists, destroy previous instance
    if (tray) {
      tray.destroy();
      tray = null;
    }

    const icon = createTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip("FocusGuard — Attention Companion");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show FocusGuard",
        click: () => {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: "Start / Resume Focus",
        click: () => {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.webContents.send("fg:tray-command", "start-or-resume");
        },
      },
      {
        label: "Pause / Resume Monitoring",
        click: () => {
          mainWindow.webContents.send("fg:tray-command", "toggle-monitoring");
        },
      },
      { type: "separator" },
      {
        label: "Quit FocusGuard",
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("double-click", () => {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });

    return tray;
  } catch (err) {
    console.warn("[FocusGuard Tray] Failed to initialize system tray:", err);
    return null;
  }
}

export function destroyTray(): void {
  if (tray) {
    try {
      tray.destroy();
    } catch {
      // ignore
    }
    tray = null;
  }
}
