/**
 * Preload Script — context-isolated IPC bridge.
 * Only explicitly typed methods are exposed to the renderer.
 * No raw Node APIs, no arbitrary channels.
 */

import { contextBridge, ipcRenderer } from "electron";

// ─── Typed API surface ─────────────────────────────────────────────────────

export interface StoragePreferences {
  version?: number;
  webcamEnabled: boolean;
  notificationsEnabled: boolean;
  interventionStyle?: "gentle" | "standard" | "minimal";
  monitoringPaused?: boolean;
  mockMode?: boolean;
}

export interface StoredSessionItem {
  id: string;
  task: string;
  startTime: string;
  endTime?: string;
  startedAt: number;
  totalFocusSeconds: number;
  totalPausedSeconds?: number;
  pauseCount: number;
  recoveryCount: number;
  status: "completed" | "abandoned" | "active";
  subtasksCount?: number;
  completedSubtasksCount?: number;
}

export interface StoredInterventionItem {
  id: string;
  timestamp: string;
  triggerReason: string;
  userAction: "return_to_task" | "break_down_task" | "take_break" | "dismiss" | "unknown";
  sessionId?: string;
  level?: string;
  message?: string;
}

export interface StorageStatsInfo {
  sessionCount: number;
  interventionCount: number;
  storageDir: string;
  storageSizeBytes: number;
}

export interface NativeNotificationOptionsPayload {
  title: string;
  body: string;
  type?: string;
  silent?: boolean;
  force?: boolean;
}

export interface FocusGuardAPI {
  getPreferences: () => Promise<StoragePreferences>;
  setPreferences: (prefs: Partial<StoragePreferences>) => Promise<{ success: boolean; preferences?: StoragePreferences }>;
  getSessions: () => Promise<StoredSessionItem[]>;
  saveSession: (session: Record<string, unknown>) => Promise<{ success: boolean; session?: StoredSessionItem }>;
  getInterventions: () => Promise<StoredInterventionItem[]>;
  saveIntervention: (intervention: Record<string, unknown>) => Promise<{ success: boolean; intervention?: StoredInterventionItem }>;
  clearHistory: (options?: { resetPreferences?: boolean }) => Promise<{
    success: boolean;
    clearedSessions: number;
    clearedInterventions: number;
    preferencesReset: boolean;
  }>;
  clearSessions: () => Promise<{ success: boolean }>;
  getStorageStats: () => Promise<StorageStatsInfo>;
  logError: (message: string) => Promise<{ success: boolean }>;
  onTrayCommand: (callback: (command: string) => void) => () => void;

  // Window controls
  minimizeWindow: () => Promise<{ success: boolean }>;
  toggleMaximizeWindow: () => Promise<boolean>;
  isWindowMaximized: () => Promise<boolean>;
  closeWindow: () => Promise<{ success: boolean }>;
  onWindowMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;

  // Native notifications
  showNotification: (options: NativeNotificationOptionsPayload) => Promise<{ sent: boolean; reason?: string }>;
  onNotificationClicked: (callback: (payload: { type?: string }) => void) => () => void;
}

const api: FocusGuardAPI = {
  getPreferences: () => ipcRenderer.invoke("fg:get-preferences") as Promise<StoragePreferences>,
  setPreferences: (prefs) => ipcRenderer.invoke("fg:set-preferences", prefs) as Promise<{ success: boolean; preferences?: StoragePreferences }>,
  getSessions: () => ipcRenderer.invoke("fg:get-sessions") as Promise<StoredSessionItem[]>,
  saveSession: (session) => ipcRenderer.invoke("fg:save-session", session) as Promise<{ success: boolean; session?: StoredSessionItem }>,
  getInterventions: () => ipcRenderer.invoke("fg:get-interventions") as Promise<StoredInterventionItem[]>,
  saveIntervention: (intervention) => ipcRenderer.invoke("fg:save-intervention", intervention) as Promise<{ success: boolean; intervention?: StoredInterventionItem }>,
  clearHistory: (options) => ipcRenderer.invoke("fg:clear-history", options) as Promise<{
    success: boolean;
    clearedSessions: number;
    clearedInterventions: number;
    preferencesReset: boolean;
  }>,
  clearSessions: () => ipcRenderer.invoke("fg:clear-sessions") as Promise<{ success: boolean }>,
  getStorageStats: () => ipcRenderer.invoke("fg:get-storage-stats") as Promise<StorageStatsInfo>,
  logError: (message) => ipcRenderer.invoke("fg:log-error", message) as Promise<{ success: boolean }>,
  onTrayCommand: (callback: (command: string) => void) => {
    const handler = (_event: unknown, command: unknown) => {
      if (typeof command === "string") callback(command);
    };
    ipcRenderer.on("fg:tray-command", handler);
    return () => {
      ipcRenderer.removeListener("fg:tray-command", handler);
    };
  },

  // Window controls implementation
  minimizeWindow: () => ipcRenderer.invoke("fg:window-minimize") as Promise<{ success: boolean }>,
  toggleMaximizeWindow: async () => {
    const res = (await ipcRenderer.invoke("fg:window-maximize-toggle")) as { success: boolean; isMaximized: boolean };
    return res.isMaximized;
  },
  isWindowMaximized: () => ipcRenderer.invoke("fg:window-is-maximized") as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke("fg:window-close") as Promise<{ success: boolean }>,
  onWindowMaximizedChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: unknown, isMaximized: unknown) => {
      if (typeof isMaximized === "boolean") callback(isMaximized);
    };
    ipcRenderer.on("fg:window-maximized-change", handler);
    return () => {
      ipcRenderer.removeListener("fg:window-maximized-change", handler);
    };
  },

  // Native notifications implementation
  showNotification: (options: NativeNotificationOptionsPayload) =>
    ipcRenderer.invoke("fg:show-notification", options) as Promise<{ sent: boolean; reason?: string }>,
  onNotificationClicked: (callback: (payload: { type?: string }) => void) => {
    const handler = (_event: unknown, payload: unknown) => {
      callback(payload as { type?: string });
    };
    ipcRenderer.on("fg:notification-clicked", handler);
    return () => {
      ipcRenderer.removeListener("fg:notification-clicked", handler);
    };
  },
};

contextBridge.exposeInMainWorld("focusGuard", api);
