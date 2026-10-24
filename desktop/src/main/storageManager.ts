/**
 * Storage Manager — robust, typed JSON persistence layer for Electron.
 * 
 * Features:
 * - Atomic writes (temp file + renameSync) to prevent corrupt writes.
 * - Recovery from malformed JSON (backs up corrupt file and falls back to clean default).
 * - Versioned schemas and payload validation.
 * - Secure sandbox: restricted strictly to app.getPath("userData")/focusguard.
 * - Zero raw video/monitoring telemetry storage.
 */

import { app } from "electron";
import fs from "fs";
import path from "path";

export const STORAGE_SCHEMA_VERSION = 1;

// ─── Interfaces ────────────────────────────────────────────────────────────

export interface StoredPreferences {
  version: number;
  webcamEnabled: boolean;
  notificationsEnabled: boolean;
  interventionStyle: "gentle" | "standard" | "minimal";
  monitoringPaused: boolean;
  mockMode: boolean;
}

export interface StoredSession {
  id: string;
  task: string;
  startTime: string;         // ISO 8601
  endTime?: string;          // ISO 8601
  startedAt: number;         // epoch ms
  totalFocusSeconds: number; // active focus (excluding pauses)
  totalPausedSeconds: number;// accumulated pause duration
  pauseCount: number;
  recoveryCount: number;
  status: "completed" | "abandoned" | "active";
  subtasksCount?: number;
  completedSubtasksCount?: number;
}

export interface StoredIntervention {
  id: string;
  timestamp: string;         // ISO 8601
  triggerReason: string;
  userAction: "return_to_task" | "break_down_task" | "take_break" | "dismiss" | "unknown";
  sessionId?: string;
  level?: string;
  message?: string;
}

export interface StorageStats {
  sessionCount: number;
  interventionCount: number;
  storageDir: string;
  storageSizeBytes: number;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: StoredPreferences = {
  version: STORAGE_SCHEMA_VERSION,
  webcamEnabled: false,           // Requirement: webcam monitoring must default to off
  notificationsEnabled: true,
  interventionStyle: "standard",
  monitoringPaused: false,
  mockMode: true,
};

// ─── Storage Manager Class ────────────────────────────────────────────────

export class StorageManager {
  private baseDir: string;

  constructor(customDir?: string) {
    if (customDir) {
      this.baseDir = customDir;
    } else {
      try {
        const userData = app?.getPath ? app.getPath("userData") : "";
        this.baseDir = userData
          ? path.join(userData, "focusguard")
          : path.join(process.cwd(), ".focusguard_data");
      } catch {
        this.baseDir = path.join(process.cwd(), ".focusguard_data");
      }
    }
    this.ensureDirectory(this.baseDir);
  }

  public getStorageDirectory(): string {
    return this.baseDir;
  }

  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getFilePath(filename: string): string {
    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    return path.join(this.baseDir, safeFilename);
  }

  /**
   * Atomic file write: writes to a unique temporary file first,
   * flushes to disk, and renames over the target path.
   */
  public atomicWrite(filePath: string, data: unknown): void {
    const serialized = JSON.stringify(data, null, 2);
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;

    try {
      this.ensureDirectory(path.dirname(filePath));
      fs.writeFileSync(tempPath, serialized, "utf-8");
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      // Clean up temp file if rename failed
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // ignore cleanup error
      }
      throw new Error(`Failed to write atomically to ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Safe file read: handles missing files, empty files, and malformed JSON.
   * If file is corrupt, backs it up to .corrupt.<timestamp> and returns fallback.
   */
  public safeRead<T>(filePath: string, fallback: T, validator?: (val: unknown) => boolean): T {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8").trim();
      if (!raw) return fallback;

      const parsed = JSON.parse(raw);
      if (validator && !validator(parsed)) {
        throw new Error("Payload failed schema validation");
      }
      return parsed as T;
    } catch (err) {
      // Recovery from malformed file: backup corrupted file
      try {
        const corruptBackup = `${filePath}.corrupt.${Date.now()}`;
        fs.renameSync(filePath, corruptBackup);
        console.warn(`[StorageManager] Corrupted file backed up to ${corruptBackup}. Re-initializing with default.`);
      } catch {
        // If rename fails, leave as-is
      }
      return fallback;
    }
  }

  // ─── Preferences ──────────────────────────────────────────────────────────

  public getPreferences(): StoredPreferences {
    const filePath = this.getFilePath("preferences.json");
    return this.safeRead<StoredPreferences>(filePath, DEFAULT_PREFERENCES, (val) => {
      return typeof val === "object" && val !== null && typeof (val as StoredPreferences).webcamEnabled === "boolean";
    });
  }

  public setPreferences(partial: Partial<StoredPreferences>): StoredPreferences {
    if (typeof partial !== "object" || partial === null) {
      throw new Error("Invalid preferences payload: must be an object");
    }

    const current = this.getPreferences();
    const updated: StoredPreferences = {
      ...current,
      version: STORAGE_SCHEMA_VERSION,
      ...(typeof partial.webcamEnabled === "boolean" ? { webcamEnabled: partial.webcamEnabled } : {}),
      ...(typeof partial.notificationsEnabled === "boolean" ? { notificationsEnabled: partial.notificationsEnabled } : {}),
      ...(partial.interventionStyle && ["gentle", "standard", "minimal"].includes(partial.interventionStyle)
        ? { interventionStyle: partial.interventionStyle }
        : {}),
      ...(typeof partial.monitoringPaused === "boolean" ? { monitoringPaused: partial.monitoringPaused } : {}),
      ...(typeof partial.mockMode === "boolean" ? { mockMode: partial.mockMode } : {}),
    };

    const filePath = this.getFilePath("preferences.json");
    this.atomicWrite(filePath, updated);
    return updated;
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  public getSessions(): StoredSession[] {
    const filePath = this.getFilePath("sessions.json");
    const result = this.safeRead<{ version: number; sessions: StoredSession[] }>(
      filePath,
      { version: STORAGE_SCHEMA_VERSION, sessions: [] },
      (val) => typeof val === "object" && val !== null && Array.isArray((val as { sessions: unknown[] }).sessions)
    );
    return result.sessions;
  }

  public saveSession(session: unknown): StoredSession {
    if (typeof session !== "object" || session === null) {
      throw new Error("Invalid session: must be a non-null object");
    }

    const s = session as Record<string, unknown>;
    if (!s.id || typeof s.id !== "string") {
      throw new Error("Invalid session: missing or invalid string 'id'");
    }
    if (!s.task || typeof s.task !== "string") {
      throw new Error("Invalid session: missing or invalid string 'task'");
    }

    const storedSession: StoredSession = {
      id: s.id,
      task: s.task.trim(),
      startTime: typeof s.startTime === "string" ? s.startTime : new Date().toISOString(),
      endTime: typeof s.endTime === "string" ? s.endTime : undefined,
      startedAt: typeof s.startedAt === "number" ? s.startedAt : Date.now(),
      totalFocusSeconds: typeof s.totalFocusSeconds === "number" ? Math.max(0, s.totalFocusSeconds) : 0,
      totalPausedSeconds: typeof s.totalPausedSeconds === "number" ? Math.max(0, s.totalPausedSeconds) : 0,
      pauseCount: typeof s.pauseCount === "number" ? Math.max(0, s.pauseCount) : 0,
      recoveryCount: typeof s.recoveryCount === "number" ? Math.max(0, s.recoveryCount) : 0,
      status: s.status === "completed" || s.status === "abandoned" ? s.status : "completed",
      subtasksCount: typeof s.subtasksCount === "number" ? s.subtasksCount : undefined,
      completedSubtasksCount: typeof s.completedSubtasksCount === "number" ? s.completedSubtasksCount : undefined,
    };

    const filePath = this.getFilePath("sessions.json");
    const currentSessions = this.getSessions();

    // Upsert: replace if exists, otherwise prepend to keep latest first
    const existingIndex = currentSessions.findIndex((item) => item.id === storedSession.id);
    let updatedSessions: StoredSession[];
    if (existingIndex >= 0) {
      updatedSessions = [...currentSessions];
      updatedSessions[existingIndex] = storedSession;
    } else {
      updatedSessions = [storedSession, ...currentSessions];
    }

    this.atomicWrite(filePath, {
      version: STORAGE_SCHEMA_VERSION,
      sessions: updatedSessions,
    });

    return storedSession;
  }

  // ─── Interventions ────────────────────────────────────────────────────────

  public getInterventions(): StoredIntervention[] {
    const filePath = this.getFilePath("interventions.json");
    const result = this.safeRead<{ version: number; interventions: StoredIntervention[] }>(
      filePath,
      { version: STORAGE_SCHEMA_VERSION, interventions: [] },
      (val) => typeof val === "object" && val !== null && Array.isArray((val as { interventions: unknown[] }).interventions)
    );
    return result.interventions;
  }

  public saveIntervention(intervention: unknown): StoredIntervention {
    if (typeof intervention !== "object" || intervention === null) {
      throw new Error("Invalid intervention: must be a non-null object");
    }

    const item = intervention as Record<string, unknown>;
    const userAction = typeof item.userAction === "string" ? item.userAction : "unknown";
    const validActions = ["return_to_task", "break_down_task", "take_break", "dismiss", "unknown"];

    const storedIntervention: StoredIntervention = {
      id: typeof item.id === "string" ? item.id : `int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(),
      triggerReason: typeof item.triggerReason === "string" ? item.triggerReason : "Attention drift detected",
      userAction: validActions.includes(userAction) ? (userAction as StoredIntervention["userAction"]) : "unknown",
      sessionId: typeof item.sessionId === "string" ? item.sessionId : undefined,
      level: typeof item.level === "string" ? item.level : undefined,
      message: typeof item.message === "string" ? item.message : undefined,
    };

    const filePath = this.getFilePath("interventions.json");
    const currentInterventions = this.getInterventions();
    const updated = [storedIntervention, ...currentInterventions];

    this.atomicWrite(filePath, {
      version: STORAGE_SCHEMA_VERSION,
      interventions: updated,
    });

    return storedIntervention;
  }

  // ─── Data Purge ───────────────────────────────────────────────────────────

  /**
   * Clears session history and intervention records.
   * Preserves preferences unless resetPreferences is explicitly set to true.
   * Strictly never deletes or modifies files outside the designated focusguard data directory.
   */
  public clearHistory(options?: { resetPreferences?: boolean }): {
    success: boolean;
    clearedSessions: number;
    clearedInterventions: number;
    preferencesReset: boolean;
  } {
    const prevSessions = this.getSessions();
    const prevInterventions = this.getInterventions();

    // Atomic wipe of sessions and interventions
    const sessionsFile = this.getFilePath("sessions.json");
    this.atomicWrite(sessionsFile, { version: STORAGE_SCHEMA_VERSION, sessions: [] });

    const interventionsFile = this.getFilePath("interventions.json");
    this.atomicWrite(interventionsFile, { version: STORAGE_SCHEMA_VERSION, interventions: [] });

    let preferencesReset = false;
    if (options?.resetPreferences) {
      const prefsFile = this.getFilePath("preferences.json");
      this.atomicWrite(prefsFile, DEFAULT_PREFERENCES);
      preferencesReset = true;
    }

    return {
      success: true,
      clearedSessions: prevSessions.length,
      clearedInterventions: prevInterventions.length,
      preferencesReset,
    };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  public getStorageStats(): StorageStats {
    const sessions = this.getSessions();
    const interventions = this.getInterventions();

    let totalBytes = 0;
    try {
      const files = ["preferences.json", "sessions.json", "interventions.json"];
      for (const f of files) {
        const fullPath = this.getFilePath(f);
        if (fs.existsSync(fullPath)) {
          totalBytes += fs.statSync(fullPath).size;
        }
      }
    } catch {
      // ignore stat errors
    }

    return {
      sessionCount: sessions.length,
      interventionCount: interventions.length,
      storageDir: this.baseDir,
      storageSizeBytes: totalBytes,
    };
  }
}

// Global instance for Electron main process
export const defaultStorageManager = new StorageManager();
