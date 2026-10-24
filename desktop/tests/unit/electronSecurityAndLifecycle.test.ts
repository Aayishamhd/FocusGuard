/**
 * Electron Security & Lifecycle Unit Tests
 *
 * Validates:
 * 1. IPC Handlers input validation & error isolation (Phase 13)
 * 2. Preload API isolation & method surface security (Phase 13)
 * 3. System tray lifecycle, menu actions, and privacy safety (Phase 15)
 * 4. Main process security configurations (contextIsolation, nodeIntegration, sandbox) (Phase 13)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { registerIpcHandlers } from "../../src/main/ipcHandlers";
import { StorageManager } from "../../src/main/storageManager";

describe("Phase 13 — Electron Security & IPC Handlers Validation", () => {
  let testDir: string;
  let storage: StorageManager;
  let handlers: Record<string, (event: unknown, ...args: unknown[]) => unknown>;
  let mockIpcMain: any;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focusguard-ipc-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    );
    storage = new StorageManager(testDir);
    handlers = {};
    mockIpcMain = {
      handle: vi.fn((channel: string, listener: any) => {
        handlers[channel] = listener;
      }),
    };
    registerIpcHandlers(mockIpcMain, storage);
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

  it("registers only expected, whitelisted IPC channels", () => {
    const registeredChannels = Object.keys(handlers).sort();
    const expectedChannels = [
      "fg:clear-history",
      "fg:clear-sessions",
      "fg:get-preferences",
      "fg:get-sessions",
      "fg:get-storage-stats",
      "fg:get-interventions",
      "fg:log-error",
      "fg:save-intervention",
      "fg:save-session",
      "fg:set-preferences",
    ].sort();

    expect(registeredChannels).toEqual(expectedChannels);
  });

  it("fg:get-preferences returns default preferences securely", async () => {
    const prefs = await handlers["fg:get-preferences"]({});
    expect(prefs).toMatchObject({
      webcamEnabled: false,
      notificationsEnabled: true,
      interventionStyle: "standard",
    });
  });

  it("fg:set-preferences rejects non-object or null payloads", () => {
    expect(() =>
      handlers["fg:set-preferences"]({}, null)
    ).toThrow(/Invalid preferences payload/i);

    expect(() =>
      handlers["fg:set-preferences"]({}, "invalid string")
    ).toThrow(/Invalid preferences payload/i);

    expect(() =>
      handlers["fg:set-preferences"]({}, 12345)
    ).toThrow(/Invalid preferences payload/i);
  });

  it("fg:set-preferences safely updates valid fields", async () => {
    const res = (await handlers["fg:set-preferences"]({}, { webcamEnabled: true })) as any;
    expect(res.success).toBe(true);
    expect(res.preferences.webcamEnabled).toBe(true);
  });

  it("fg:save-session validates and persists a session item", async () => {
    const sessionPayload = {
      id: "sess-sec-1",
      task: "Security Audit",
      startTime: new Date().toISOString(),
      startedAt: Date.now(),
      totalFocusSeconds: 1200,
      pauseCount: 0,
      recoveryCount: 1,
      status: "completed",
    };

    const res = (await handlers["fg:save-session"]({}, sessionPayload)) as any;
    expect(res.success).toBe(true);
    expect(res.session.id).toBe("sess-sec-1");

    const allSessions = (await handlers["fg:get-sessions"]({})) as any[];
    expect(allSessions.length).toBe(1);
    expect(allSessions[0].task).toBe("Security Audit");
  });

  it("fg:save-intervention records gentle intervention safely", async () => {
    const interventionPayload = {
      id: "int-sec-1",
      timestamp: new Date().toISOString(),
      triggerReason: "attention_drifting",
      userAction: "return_to_task",
      level: "gentle",
      message: "Refocus prompt",
    };

    const res = (await handlers["fg:save-intervention"]({}, interventionPayload)) as any;
    expect(res.success).toBe(true);
    expect(res.intervention.id).toBe("int-sec-1");

    const allInterventions = (await handlers["fg:get-interventions"]({})) as any[];
    expect(allInterventions.length).toBe(1);
  });

  it("fg:clear-history deletes sessions and interventions while preserving preferences", async () => {
    await handlers["fg:set-preferences"]({}, { webcamEnabled: true });
    await handlers["fg:save-session"]({}, {
      id: "sess-temp",
      task: "Temporary Task",
      startTime: new Date().toISOString(),
      startedAt: Date.now(),
      totalFocusSeconds: 60,
      pauseCount: 0,
      recoveryCount: 0,
      status: "completed",
    });

    const purgeRes = (await handlers["fg:clear-history"]({}, { resetPreferences: false })) as any;
    expect(purgeRes.success).toBe(true);
    expect(purgeRes.clearedSessions).toBe(1);
    expect(purgeRes.preferencesReset).toBe(false);

    // Sessions should now be empty
    const sessions = (await handlers["fg:get-sessions"]({})) as any[];
    expect(sessions.length).toBe(0);

    // Preferences should remain intact
    const prefs = (await handlers["fg:get-preferences"]({})) as any;
    expect(prefs.webcamEnabled).toBe(true);
  });

  it("fg:log-error handles error messages without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = (await handlers["fg:log-error"]({}, "Test error message")) as any;
    expect(res.success).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith("[FocusGuard Renderer Error]", "Test error message");
    consoleSpy.mockRestore();
  });
});

describe("Phase 13 & 15 — System Tray & Main Window Lifecycle", () => {
  it("handles tray setup defensively and supports cleanup without crashing", async () => {
    const mockMainWindow: any = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: {
        send: vi.fn(),
      },
    };

    const setupTrayModule = await import("../../src/main/tray");

    // Tray initialization in headless environment handles missing electron smoothly
    expect(() => setupTrayModule.setupTray(mockMainWindow)).not.toThrow();

    // Verify destroy tray is callable without crash
    expect(() => setupTrayModule.destroyTray()).not.toThrow();
  });

  it("main window configuration enforces strict Electron security flags", () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, "../../src/main/index.ts"),
      "utf8"
    );

    // 1. contextIsolation must be true
    expect(mainSrc).toMatch(/contextIsolation:\s*true/);

    // 2. nodeIntegration must be false
    expect(mainSrc).toMatch(/nodeIntegration:\s*false/);

    // 3. sandbox must be true
    expect(mainSrc).toMatch(/sandbox:\s*true/);

    // 4. webSecurity must be true
    expect(mainSrc).toMatch(/webSecurity:\s*true/);

    // 5. External link protection via setWindowOpenHandler
    expect(mainSrc).toMatch(/setWindowOpenHandler/);
    expect(mainSrc).toMatch(/action:\s*"deny"/);

    // 6. Navigation protection via will-navigate
    expect(mainSrc).toMatch(/will-navigate/);
    expect(mainSrc).toMatch(/event\.preventDefault\(\)/);
  });

  it("preload script enforces strict isolation and typed methods only", () => {
    const preloadSrc = fs.readFileSync(
      path.join(__dirname, "../../src/preload/index.ts"),
      "utf8"
    );

    // 1. contextBridge.exposeInMainWorld must be used
    expect(preloadSrc).toMatch(/contextBridge\.exposeInMainWorld/);

    // 2. focusGuard namespace used
    expect(preloadSrc).toMatch(/"focusGuard"/);

    // 3. Raw ipcRenderer is not exposed directly
    expect(preloadSrc).not.toMatch(/contextBridge\.exposeInMainWorld\([^,]+,\s*ipcRenderer\)/);

    // 4. Required methods are explicitly listed
    expect(preloadSrc).toMatch(/getPreferences/);
    expect(preloadSrc).toMatch(/setPreferences/);
    expect(preloadSrc).toMatch(/getSessions/);
    expect(preloadSrc).toMatch(/saveSession/);
    expect(preloadSrc).toMatch(/getInterventions/);
    expect(preloadSrc).toMatch(/saveIntervention/);
    expect(preloadSrc).toMatch(/clearHistory/);
  });
});
