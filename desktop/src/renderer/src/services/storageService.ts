/**
 * Storage Service (Renderer) — unified persistence adapter.
 * Uses Electron IPC (window.focusGuard) when available.
 * Falls back to localStorage / in-memory cache for browser dev and testing.
 */

import type {
  StoredSessionRecord,
  StoredInterventionRecord,
  UserPreferences,
} from "../types/app";

export interface StorageStats {
  sessionCount: number;
  interventionCount: number;
  storageDir: string;
  storageSizeBytes: number;
}

export const DEFAULT_RENDERER_PREFERENCES: UserPreferences = {
  webcamEnabled: false,          // Requirement: webcam monitoring defaults to off
  notificationsEnabled: true,
  interventionStyle: "standard",
  monitoringPaused: false,
  mockMode: true,
};

// Fallback in-memory / localStorage keys
const LOCAL_STORAGE_PREFS_KEY = "focusguard_preferences";
const LOCAL_STORAGE_SESSIONS_KEY = "focusguard_sessions";
const LOCAL_STORAGE_INTERVENTIONS_KEY = "focusguard_interventions";

class StorageService {
  private memorySessions: StoredSessionRecord[] = [];
  private memoryInterventions: StoredInterventionRecord[] = [];
  private memoryPrefs: UserPreferences = { ...DEFAULT_RENDERER_PREFERENCES };

  // ─── Preferences ──────────────────────────────────────────────────────────

  async getPreferences(): Promise<UserPreferences> {
    if (typeof window !== "undefined" && window.focusGuard?.getPreferences) {
      try {
        const prefs = await window.focusGuard.getPreferences();
        return {
          webcamEnabled: Boolean(prefs.webcamEnabled),
          notificationsEnabled: prefs.notificationsEnabled !== false,
          mockMode: prefs.mockMode !== false,
          interventionStyle: prefs.interventionStyle ?? "standard",
          monitoringPaused: Boolean(prefs.monitoringPaused),
        };
      } catch (err) {
        console.warn("[StorageService] Failed to get preferences via IPC, falling back to local:", err);
      }
    }

    // Fallback: localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFS_KEY);
        if (raw) return { ...this.memoryPrefs, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }

    return { ...this.memoryPrefs };
  }

  async setPreferences(partial: Partial<UserPreferences>): Promise<UserPreferences> {
    if (typeof window !== "undefined" && window.focusGuard?.setPreferences) {
      try {
        const res = await window.focusGuard.setPreferences(partial);
        if (res.preferences) {
          return {
            webcamEnabled: Boolean(res.preferences.webcamEnabled),
            notificationsEnabled: res.preferences.notificationsEnabled !== false,
            mockMode: res.preferences.mockMode !== false,
            interventionStyle: res.preferences.interventionStyle ?? "standard",
            monitoringPaused: Boolean(res.preferences.monitoringPaused),
          };
        }
      } catch (err) {
        console.warn("[StorageService] Failed to set preferences via IPC:", err);
      }
    }

    // Fallback: update memory & localStorage
    this.memoryPrefs = { ...this.memoryPrefs, ...partial };
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(LOCAL_STORAGE_PREFS_KEY, JSON.stringify(this.memoryPrefs));
      }
    } catch {
      // ignore
    }

    return { ...this.memoryPrefs };
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async getSessions(): Promise<StoredSessionRecord[]> {
    if (typeof window !== "undefined" && window.focusGuard?.getSessions) {
      try {
        const raw = await window.focusGuard.getSessions();
        return (raw as unknown as StoredSessionRecord[]) || [];
      } catch (err) {
        console.warn("[StorageService] Failed to get sessions via IPC:", err);
      }
    }

    // Fallback: localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY);
        if (raw) return JSON.parse(raw) as StoredSessionRecord[];
      }
    } catch {
      // ignore
    }

    return [...this.memorySessions];
  }

  async saveSession(session: StoredSessionRecord): Promise<boolean> {
    if (typeof window !== "undefined" && window.focusGuard?.saveSession) {
      try {
        const res = await window.focusGuard.saveSession(session as unknown as Record<string, unknown>);
        return Boolean(res.success);
      } catch (err) {
        console.warn("[StorageService] Failed to save session via IPC:", err);
        return false;
      }
    }

    // Fallback: update memory and localStorage
    const existingIndex = this.memorySessions.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      this.memorySessions[existingIndex] = session;
    } else {
      this.memorySessions.unshift(session);
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(this.memorySessions));
      }
    } catch {
      // ignore
    }

    return true;
  }

  // ─── Interventions ────────────────────────────────────────────────────────

  async getInterventions(): Promise<StoredInterventionRecord[]> {
    if (typeof window !== "undefined" && window.focusGuard?.getInterventions) {
      try {
        const raw = await window.focusGuard.getInterventions();
        return (raw as unknown as StoredInterventionRecord[]) || [];
      } catch (err) {
        console.warn("[StorageService] Failed to get interventions via IPC:", err);
      }
    }

    // Fallback: localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_INTERVENTIONS_KEY);
        if (raw) return JSON.parse(raw) as StoredInterventionRecord[];
      }
    } catch {
      // ignore
    }

    return [...this.memoryInterventions];
  }

  async saveIntervention(intervention: StoredInterventionRecord): Promise<boolean> {
    if (typeof window !== "undefined" && window.focusGuard?.saveIntervention) {
      try {
        const res = await window.focusGuard.saveIntervention(
          intervention as unknown as Record<string, unknown>
        );
        return Boolean(res.success);
      } catch (err) {
        console.warn("[StorageService] Failed to save intervention via IPC:", err);
        return false;
      }
    }

    // Fallback: update memory and localStorage
    this.memoryInterventions.unshift(intervention);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          LOCAL_STORAGE_INTERVENTIONS_KEY,
          JSON.stringify(this.memoryInterventions)
        );
      }
    } catch {
      // ignore
    }

    return true;
  }

  // ─── Clear Data ───────────────────────────────────────────────────────────

  async clearHistory(options?: { resetPreferences?: boolean }): Promise<{
    success: boolean;
    clearedSessions: number;
    clearedInterventions: number;
    preferencesReset: boolean;
  }> {
    if (typeof window !== "undefined" && window.focusGuard?.clearHistory) {
      try {
        return await window.focusGuard.clearHistory(options);
      } catch (err) {
        console.error("[StorageService] clearHistory IPC error:", err);
        throw err;
      }
    }

    // Fallback: clear local memory & storage
    const sessionCount = this.memorySessions.length;
    const interventionCount = this.memoryInterventions.length;
    this.memorySessions = [];
    this.memoryInterventions = [];

    let preferencesReset = false;
    if (options?.resetPreferences) {
      this.memoryPrefs = { ...DEFAULT_RENDERER_PREFERENCES };
      preferencesReset = true;
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(LOCAL_STORAGE_SESSIONS_KEY);
        window.localStorage.removeItem(LOCAL_STORAGE_INTERVENTIONS_KEY);
        if (options?.resetPreferences) {
          window.localStorage.removeItem(LOCAL_STORAGE_PREFS_KEY);
        }
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      clearedSessions: sessionCount,
      clearedInterventions: interventionCount,
      preferencesReset,
    };
  }

  async getStorageStats(): Promise<StorageStats> {
    if (typeof window !== "undefined" && window.focusGuard?.getStorageStats) {
      try {
        return await window.focusGuard.getStorageStats();
      } catch {
        // fallback below
      }
    }

    return {
      sessionCount: this.memorySessions.length,
      interventionCount: this.memoryInterventions.length,
      storageDir: "Local Storage (Sandbox)",
      storageSizeBytes: 0,
    };
  }
}

export const storageService = new StorageService();
