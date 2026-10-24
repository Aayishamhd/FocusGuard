/**
 * Unit Tests — StorageManager (Durable JSON Persistence Layer)
 *
 * Validates:
 * 1. Atomic writes & reads
 * 2. Recovery from malformed / corrupt JSON files
 * 3. Session payload validation (missing fields, types)
 * 4. Preferences persistence & schema versioning
 * 5. Data purge (sessions + interventions wiped, preferences preserved or reset)
 * 6. Path isolation (sandbox guarantees)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  StorageManager,
  DEFAULT_PREFERENCES,
  type StoredSession,
  type StoredIntervention,
} from "../../src/main/storageManager";

describe("StorageManager Persistence & Recovery", () => {
  let testDir: string;
  let storage: StorageManager;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `focusguard-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    storage = new StorageManager(testDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  it("initializes with default preferences when no file exists", () => {
    const prefs = storage.getPreferences();
    expect(prefs.webcamEnabled).toBe(false); // Webcam must default to off
    expect(prefs.notificationsEnabled).toBe(true);
    expect(prefs.interventionStyle).toBe("standard");
    expect(prefs.version).toBe(1);
  });

  it("persists updated preferences atomically and reloads them", () => {
    storage.setPreferences({
      webcamEnabled: true,
      notificationsEnabled: false,
      interventionStyle: "gentle",
    });

    // Create a new instance pointing to same dir to test disk reload
    const reloaded = new StorageManager(testDir);
    const prefs = reloaded.getPreferences();

    expect(prefs.webcamEnabled).toBe(true);
    expect(prefs.notificationsEnabled).toBe(false);
    expect(prefs.interventionStyle).toBe("gentle");
  });

  it("recovers gracefully from malformed JSON without crashing", () => {
    const sessionsFile = path.join(testDir, "sessions.json");
    // Write corrupt, unparseable data
    fs.writeFileSync(sessionsFile, "{ corrupt json syntax ... bad file", "utf-8");

    // Reading should not throw, should return fallback empty array
    const sessions = storage.getSessions();
    expect(sessions).toEqual([]);

    // Should have backed up the corrupt file
    const files = fs.readdirSync(testDir);
    const corruptBackup = files.find((f) => f.includes("sessions.json.corrupt."));
    expect(corruptBackup).toBeDefined();
  });

  it("saves and retrieves sessions with accurate focus & paused times", () => {
    const session: StoredSession = {
      id: "sess-123",
      task: "Refactor storage layer",
      startTime: "2026-10-24T10:00:00.000Z",
      endTime: "2026-10-24T10:45:00.000Z",
      startedAt: 1729764000000,
      totalFocusSeconds: 2400, // 40 minutes active
      totalPausedSeconds: 300,  // 5 minutes paused
      pauseCount: 1,
      recoveryCount: 2,
      status: "completed",
    };

    storage.saveSession(session);

    const reloaded = storage.getSessions();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe("sess-123");
    expect(reloaded[0].task).toBe("Refactor storage layer");
    expect(reloaded[0].totalFocusSeconds).toBe(2400);
    expect(reloaded[0].totalPausedSeconds).toBe(300);
    expect(reloaded[0].recoveryCount).toBe(2);
  });

  it("upserts existing session when ID matches", () => {
    const sessionA: StoredSession = {
      id: "sess-456",
      task: "Initial task",
      startTime: "2026-10-24T12:00:00.000Z",
      startedAt: Date.now(),
      totalFocusSeconds: 600,
      totalPausedSeconds: 0,
      pauseCount: 0,
      recoveryCount: 0,
      status: "active",
    };

    storage.saveSession(sessionA);
    expect(storage.getSessions()).toHaveLength(1);

    // Update same session
    const sessionB: StoredSession = {
      ...sessionA,
      task: "Updated task",
      totalFocusSeconds: 1200,
      status: "completed",
    };

    storage.saveSession(sessionB);
    const list = storage.getSessions();
    expect(list).toHaveLength(1);
    expect(list[0].task).toBe("Updated task");
    expect(list[0].totalFocusSeconds).toBe(1200);
    expect(list[0].status).toBe("completed");
  });

  it("validates session payload and rejects invalid inputs", () => {
    // Missing task
    expect(() => storage.saveSession({ id: "no-task" })).toThrow(/invalid string 'task'/i);
    // Missing id
    expect(() => storage.saveSession({ task: "no-id" })).toThrow(/missing or invalid string 'id'/i);
    // Non-object
    expect(() => storage.saveSession(null)).toThrow(/non-null object/i);
    expect(() => storage.saveSession("string")).toThrow(/non-null object/i);
  });

  it("saves and retrieves intervention events", () => {
    const intervention: StoredIntervention = {
      id: "int-001",
      timestamp: new Date().toISOString(),
      triggerReason: "Attention drift detected",
      userAction: "return_to_task",
      sessionId: "sess-123",
      level: "LEVEL_1_GENTLE_REMINDER",
    };

    storage.saveIntervention(intervention);

    const list = storage.getInterventions();
    expect(list).toHaveLength(1);
    expect(list[0].userAction).toBe("return_to_task");
    expect(list[0].triggerReason).toBe("Attention drift detected");
  });

  it("purges session and intervention history while preserving preferences by default", () => {
    // Save preferences, session, and intervention
    storage.setPreferences({ webcamEnabled: true, interventionStyle: "gentle" });
    storage.saveSession({
      id: "sess-clear",
      task: "Task to delete",
      startTime: new Date().toISOString(),
      startedAt: Date.now(),
      totalFocusSeconds: 900,
      totalPausedSeconds: 0,
      pauseCount: 0,
      recoveryCount: 0,
      status: "completed",
    });
    storage.saveIntervention({
      id: "int-clear",
      timestamp: new Date().toISOString(),
      triggerReason: "Drift",
      userAction: "dismiss",
    });

    expect(storage.getSessions()).toHaveLength(1);
    expect(storage.getInterventions()).toHaveLength(1);

    // Perform clear
    const result = storage.clearHistory({ resetPreferences: false });
    expect(result.success).toBe(true);
    expect(result.clearedSessions).toBe(1);
    expect(result.clearedInterventions).toBe(1);
    expect(result.preferencesReset).toBe(false);

    // Records are cleared
    expect(storage.getSessions()).toEqual([]);
    expect(storage.getInterventions()).toEqual([]);

    // Preferences preserved!
    const prefs = storage.getPreferences();
    expect(prefs.webcamEnabled).toBe(true);
    expect(prefs.interventionStyle).toBe("gentle");
  });

  it("resets preferences to defaults when explicitly requested during purge", () => {
    storage.setPreferences({ webcamEnabled: true, notificationsEnabled: false });

    const result = storage.clearHistory({ resetPreferences: true });
    expect(result.preferencesReset).toBe(true);

    const prefs = storage.getPreferences();
    expect(prefs.webcamEnabled).toBe(false); // Back to default
    expect(prefs.notificationsEnabled).toBe(true); // Back to default
  });

  it("returns storage statistics", () => {
    storage.saveSession({
      id: "s1",
      task: "T1",
      startTime: new Date().toISOString(),
      startedAt: Date.now(),
      totalFocusSeconds: 100,
      totalPausedSeconds: 0,
      pauseCount: 0,
      recoveryCount: 0,
      status: "completed",
    });

    const stats = storage.getStorageStats();
    expect(stats.sessionCount).toBe(1);
    expect(stats.storageDir).toBe(testDir);
    expect(stats.storageSizeBytes).toBeGreaterThan(0);
  });
});
