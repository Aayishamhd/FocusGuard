/**
 * NotificationManager — Electron Main Process Native Notification Service
 *
 * Provides OS-level desktop notifications with:
 * - Electron native Notification API
 * - Notification throttling / debouncing to prevent distraction spam
 * - Click handling to restore, un-minimize, and focus the main window
 * - Graceful fallback when notifications are disabled or unsupported
 */

import { Notification, BrowserWindow, app, nativeImage, type NativeImage } from "electron";
import path from "path";
import fs from "fs";

export interface NativeNotificationOptions {
  title: string;
  body: string;
  type?: "reminder" | "distraction" | "recovery" | "stuck" | "break" | "session_start" | "session_end" | "general";
  silent?: boolean;
  force?: boolean;
}

export interface NotificationResult {
  sent: boolean;
  reason?: string;
}

export class NotificationManager {
  private lastNotificationTimeByType = new Map<string, number>();
  private lastGlobalNotificationTime = 0;

  // Rate limiting policies:
  // Same notification type cannot repeat within 30 seconds
  // Any notification cannot fire within 10 seconds (unless forced)
  private readonly typeCooldownMs = 30000;
  private readonly globalCooldownMs = 10000;

  constructor(private getWindow: () => BrowserWindow | null = () => null) {}

  /**
   * Resolves application icon for notification badges if available.
   */
  private getNotificationIcon(): NativeImage | undefined {
    try {
      const candidatePaths = [
        path.join(app.getAppPath(), "assets", "tray-icon.png"),
        path.join(app.getAppPath(), "assets", "icon.png"),
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          const img = nativeImage.createFromPath(p);
          if (!img.isEmpty()) return img;
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * Displays a native desktop notification if environment supports it and cooldown allows.
   */
  public showNotification(options: NativeNotificationOptions): NotificationResult {
    const isSupported =
      typeof Notification !== "undefined" &&
      typeof Notification.isSupported === "function"
        ? Notification.isSupported()
        : false;
    if (!isSupported) {
      return { sent: false, reason: "Native OS notifications are unsupported in this environment" };
    }

    const now = Date.now();
    const typeKey = options.type || "general";

    // Enforce throttling unless explicitly forced (e.g. dev testing or critical alert)
    if (!options.force) {
      if (now - this.lastGlobalNotificationTime < this.globalCooldownMs) {
        return { sent: false, reason: "Suppressed by global notification rate limiter" };
      }
      const lastTypeTime = this.lastNotificationTimeByType.get(typeKey) || 0;
      if (now - lastTypeTime < this.typeCooldownMs) {
        return { sent: false, reason: `Suppressed: '${typeKey}' notification cooldown active` };
      }
    }

    try {
      const icon = this.getNotificationIcon();
      const notification = new Notification({
        title: options.title,
        body: options.body,
        icon,
        silent: options.silent ?? false,
      });

      notification.on("click", () => {
        try {
          const win = this.getWindow();
          if (win && !win.isDestroyed()) {
            if (win.isMinimized()) {
              win.restore();
            }
            win.show();
            win.focus();
            win.webContents.send("fg:notification-clicked", { type: options.type });
          }
        } catch (err) {
          console.warn("[FocusGuard Notification] Error handling notification click:", err);
        }
      });

      notification.show();
      this.lastNotificationTimeByType.set(typeKey, now);
      this.lastGlobalNotificationTime = now;
      return { sent: true };
    } catch (err) {
      console.warn("[FocusGuard Notification] Failed to display notification:", err);
      return { sent: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Resets internal rate-limiting timestamps (useful for unit tests).
   */
  public resetCooldowns(): void {
    this.lastNotificationTimeByType.clear();
    this.lastGlobalNotificationTime = 0;
  }
}
