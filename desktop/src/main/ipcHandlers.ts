/**
 * IPC Handlers — secure bridge between renderer and main process.
 * All inputs are strictly validated before processing.
 * Uses StorageManager inside Electron app.getPath("userData")/focusguard.
 */

import { IpcMain } from "electron";
import {
  defaultStorageManager,
  StorageManager,
  type StoredPreferences,
  type StoredSession,
  type StoredIntervention,
  type StorageStats,
} from "./storageManager";

export function registerIpcHandlers(
  ipcMain: IpcMain,
  storage: StorageManager = defaultStorageManager
): void {
  // ─── Preferences ──────────────────────────────────────────────────────────

  ipcMain.handle("fg:get-preferences", (): StoredPreferences => {
    return storage.getPreferences();
  });

  ipcMain.handle("fg:set-preferences", (_event, partial: unknown): { success: boolean; preferences: StoredPreferences } => {
    if (typeof partial !== "object" || partial === null) {
      throw new Error("Invalid preferences payload: must be an object");
    }
    const updated = storage.setPreferences(partial as Partial<StoredPreferences>);
    return { success: true, preferences: updated };
  });

  // ─── Sessions ─────────────────────────────────────────────────────────────

  ipcMain.handle("fg:get-sessions", (): StoredSession[] => {
    return storage.getSessions();
  });

  ipcMain.handle("fg:save-session", (_event, session: unknown): { success: boolean; session: StoredSession } => {
    const saved = storage.saveSession(session);
    return { success: true, session: saved };
  });

  ipcMain.handle("fg:clear-sessions", (): { success: boolean } => {
    storage.clearHistory({ resetPreferences: false });
    return { success: true };
  });

  // ─── Interventions ────────────────────────────────────────────────────────

  ipcMain.handle("fg:get-interventions", (): StoredIntervention[] => {
    return storage.getInterventions();
  });

  ipcMain.handle("fg:save-intervention", (_event, intervention: unknown): { success: boolean; intervention: StoredIntervention } => {
    const saved = storage.saveIntervention(intervention);
    return { success: true, intervention: saved };
  });

  // ─── Data Purge & Stats ───────────────────────────────────────────────────

  ipcMain.handle(
    "fg:clear-history",
    (
      _event,
      options?: { resetPreferences?: boolean }
    ): { success: boolean; clearedSessions: number; clearedInterventions: number; preferencesReset: boolean } => {
      return storage.clearHistory(options);
    }
  );

  ipcMain.handle("fg:get-storage-stats", (): StorageStats => {
    return storage.getStorageStats();
  });

  // ─── Error Logging ────────────────────────────────────────────────────────

  ipcMain.handle("fg:log-error", (_event, message: unknown): { success: boolean } => {
    if (typeof message === "string") {
      console.error("[FocusGuard Renderer Error]", message);
    }
    return { success: true };
  });
}
