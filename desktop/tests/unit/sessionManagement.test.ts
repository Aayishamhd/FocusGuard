/**
 * FocusGuard Session Management & Timer Accuracy Tests
 *
 * Verifies Part 2 requirements:
 * 1. Starting, pausing, resuming, and ending sessions.
 * 2. Timer accuracy and pause accounting (excluding paused duration).
 * 3. Prevention of invalid session transitions and duplicate starts.
 * 4. Task description validation (empty, whitespace, excessive length).
 * 5. Subtask completion, progression, and active step selection.
 * 6. Attention state rendering and non-punitive canonical mappings.
 * 7. Engine disconnection handling.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { appReducer, INITIAL_STATE, type Action } from "../../src/renderer/src/store/appStore";
import {
  calculateActiveElapsedSeconds,
  formatTimerDisplay,
  formatDurationHuman,
  validateTaskInput,
  MAX_TASK_LENGTH,
} from "../../src/renderer/src/services/sessionTimer";
import { ATTENTION_CONFIG } from "../../src/renderer/src/components/AttentionBadge";
import { MockEngineClient } from "../../src/renderer/src/services/mockEngineClient";
import type { AttentionState } from "../../src/renderer/src/types/contracts";

describe("Part 2 — Task Validation", () => {
  it("rejects blank or empty task strings", () => {
    expect(validateTaskInput("").valid).toBe(false);
    expect(validateTaskInput("   ").valid).toBe(false);
    expect(validateTaskInput("\t\n").valid).toBe(false);
  });

  it("rejects task names exceeding MAX_TASK_LENGTH (120 chars)", () => {
    const longTask = "a".repeat(MAX_TASK_LENGTH + 1);
    const result = validateTaskInput(longTask);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too long");
  });

  it("accepts valid task descriptions and trims surrounding whitespace", () => {
    const result = validateTaskInput("   Refactor dashboard architecture   ");
    expect(result.valid).toBe(true);
    expect(result.trimmed).toBe("Refactor dashboard architecture");
  });
});

describe("Part 2 — Session Lifecycle Transitions", () => {
  let state = INITIAL_STATE;

  beforeEach(() => {
    state = { ...INITIAL_STATE };
  });

  it("starts session with initial timestamps, zero pauses, and running status", () => {
    const baseTime = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(baseTime);

    const action: Action = { type: "START_SESSION", task: "Build FocusGuard Dashboard" };
    state = appReducer(state, action);

    expect(state.currentSession).not.toBeNull();
    expect(state.currentSession?.task).toBe("Build FocusGuard Dashboard");
    expect(state.currentSession?.status).toBe("running");
    expect(state.currentSession?.startedAt).toBe(baseTime);
    expect(state.currentSession?.pausedAt).toBeNull();
    expect(state.currentSession?.totalPausedMs).toBe(0);
    expect(state.currentSession?.pauseCount).toBe(0);
    expect(state.currentSession?.recoveryCount).toBe(0);
    expect(state.currentAttentionState).toBe("FOCUSED");

    vi.restoreAllMocks();
  });

  it("prevents duplicate session starts when a session is already running", () => {
    const startAction: Action = { type: "START_SESSION", task: "Task A" };
    state = appReducer(state, startAction);
    const firstSessionId = state.currentSession?.id;

    // Attempt second start while first is running
    const duplicateAction: Action = { type: "START_SESSION", task: "Task B" };
    state = appReducer(state, duplicateAction);

    expect(state.currentSession?.id).toBe(firstSessionId);
    expect(state.currentSession?.task).toBe("Task A");
  });

  it("pauses an active session and tracks pause timestamp and count", () => {
    state = appReducer(state, { type: "START_SESSION", task: "Focus Work" });

    const pauseTime = 1700000010000;
    vi.spyOn(Date, "now").mockReturnValue(pauseTime);

    state = appReducer(state, { type: "PAUSE_SESSION" });

    expect(state.currentSession?.status).toBe("paused");
    expect(state.currentSession?.pausedAt).toBe(pauseTime);
    expect(state.currentSession?.pauseCount).toBe(1);

    vi.restoreAllMocks();
  });

  it("resumes a paused session and accumulates paused duration", () => {
    const t0 = 1700000000000;
    const tPause = t0 + 10000; // paused after 10s
    const tResume = tPause + 25000; // paused for 25s

    vi.spyOn(Date, "now").mockReturnValue(t0);
    state = appReducer(state, { type: "START_SESSION", task: "Deep Coding" });

    vi.spyOn(Date, "now").mockReturnValue(tPause);
    state = appReducer(state, { type: "PAUSE_SESSION" });

    vi.spyOn(Date, "now").mockReturnValue(tResume);
    state = appReducer(state, { type: "RESUME_SESSION" });

    expect(state.currentSession?.status).toBe("running");
    expect(state.currentSession?.pausedAt).toBeNull();
    expect(state.currentSession?.totalPausedMs).toBe(25000);
    expect(state.currentSession?.pauseCount).toBe(1);

    vi.restoreAllMocks();
  });

  it("ends session, computes accurate active duration, and creates insight", () => {
    const t0 = 1700000000000;
    const tEnd = t0 + 125000; // 125s total, 0 paused

    vi.spyOn(Date, "now").mockReturnValue(t0);
    state = appReducer(state, { type: "START_SESSION", task: "Feature 3 Integration" });

    vi.spyOn(Date, "now").mockReturnValue(tEnd);
    state = appReducer(state, { type: "END_SESSION" });

    expect(state.currentSession?.status).toBe("completed");
    expect(state.currentSession?.totalFocusSeconds).toBe(125);
    expect(state.currentAttentionState).toBe("IDLE");
    expect(state.sessionHistory.length).toBe(1);
    expect(state.recentInsight).not.toBeNull();
    expect(state.recentInsight?.message).toContain("Feature 3 Integration");

    vi.restoreAllMocks();
  });
});

describe("Part 2 — Invalid Session Transitions", () => {
  let state = INITIAL_STATE;

  beforeEach(() => {
    state = { ...INITIAL_STATE };
  });

  it("ignores PAUSE when session is idle", () => {
    state = appReducer(state, { type: "PAUSE_SESSION" });
    expect(state.currentSession).toBeNull();
  });

  it("ignores PAUSE when already paused (no double-pause or extra count)", () => {
    state = appReducer(state, { type: "START_SESSION", task: "Work" });
    state = appReducer(state, { type: "PAUSE_SESSION" });
    const originalPausedAt = state.currentSession?.pausedAt;

    // Second pause attempt
    state = appReducer(state, { type: "PAUSE_SESSION" });
    expect(state.currentSession?.status).toBe("paused");
    expect(state.currentSession?.pauseCount).toBe(1);
    expect(state.currentSession?.pausedAt).toBe(originalPausedAt);
  });

  it("ignores RESUME when session is running", () => {
    state = appReducer(state, { type: "START_SESSION", task: "Work" });
    state = appReducer(state, { type: "RESUME_SESSION" });
    expect(state.currentSession?.status).toBe("running");
    expect(state.currentSession?.totalPausedMs).toBe(0);
  });

  it("ignores RESUME when session is idle", () => {
    state = appReducer(state, { type: "RESUME_SESSION" });
    expect(state.currentSession).toBeNull();
  });

  it("ignores END_SESSION when session is idle", () => {
    state = appReducer(state, { type: "END_SESSION" });
    expect(state.currentSession).toBeNull();
    expect(state.sessionHistory.length).toBe(0);
  });

  it("ignores duplicate start when session is paused", () => {
    state = appReducer(state, { type: "START_SESSION", task: "Task Paused" });
    state = appReducer(state, { type: "PAUSE_SESSION" });
    const originalId = state.currentSession?.id;

    state = appReducer(state, { type: "START_SESSION", task: "New Task Attempt" });
    expect(state.currentSession?.id).toBe(originalId);
    expect(state.currentSession?.status).toBe("paused");
  });
});

describe("Part 2 — Timer Accuracy & Pause Accounting", () => {
  it("calculates active elapsed seconds directly from timestamps", () => {
    const session = {
      startedAt: 1000000,
      pausedAt: null,
      totalPausedMs: 0,
      status: "running" as const,
      totalFocusSeconds: 0,
    };

    // Exactly 45.8 seconds later
    const elapsed = calculateActiveElapsedSeconds(session, 1000000 + 45800);
    expect(elapsed).toBe(45);
  });

  it("freezes elapsed time while paused and does not accumulate during pause", () => {
    const session = {
      startedAt: 1000000,
      pausedAt: 1030000, // paused after 30s
      totalPausedMs: 0,
      status: "paused" as const,
      totalFocusSeconds: 0,
    };

    // 10 minutes later while still paused
    const elapsedAt10Min = calculateActiveElapsedSeconds(session, 1000000 + 600000);
    expect(elapsedAt10Min).toBe(30);

    // 1 hour later while still paused
    const elapsedAt1Hour = calculateActiveElapsedSeconds(session, 1000000 + 3600000);
    expect(elapsedAt1Hour).toBe(30);
  });

  it("accurately excludes paused duration across multiple pause/resume cycles", () => {
    // Scenario:
    // T=0: Start session
    // T=20s: Pause 1 (runs 20s active)
    // T=50s: Resume 1 (30s paused)
    // T=80s: Pause 2 (30s active -> 50s total active)
    // T=95s: Resume 2 (15s paused -> 45s total paused)
    // T=110s: Check active time (15s active -> 65s total active)
    const t0 = 1000000;
    const session = {
      startedAt: t0,
      pausedAt: null,
      totalPausedMs: 45000, // 30s + 15s paused
      status: "running" as const,
      totalFocusSeconds: 0,
    };

    const elapsed = calculateActiveElapsedSeconds(session, t0 + 110000);
    // 110s total elapsed - 45s total paused = 65s active focus
    expect(elapsed).toBe(65);
  });

  it("is immune to background tab throttling or delayed renderer execution", () => {
    // If browser throttles intervals for 5 minutes, Date.now() still gives exact time
    const t0 = 1000000;
    const session = {
      startedAt: t0,
      pausedAt: null,
      totalPausedMs: 0,
      status: "running" as const,
      totalFocusSeconds: 0,
    };

    const elapsedAfterThrottle = calculateActiveElapsedSeconds(session, t0 + 300000);
    expect(elapsedAfterThrottle).toBe(300);
  });

  it("formats display strings accurately for MM:SS and HH:MM:SS", () => {
    expect(formatTimerDisplay(0)).toBe("00:00");
    expect(formatTimerDisplay(45)).toBe("00:45");
    expect(formatTimerDisplay(125)).toBe("02:05");
    expect(formatTimerDisplay(3600)).toBe("01:00:00");
    expect(formatTimerDisplay(3665)).toBe("01:01:05");

    expect(formatDurationHuman(45)).toBe("45s");
    expect(formatDurationHuman(125)).toBe("2m 5s");
    expect(formatDurationHuman(3665)).toBe("1h 1m 5s");
  });
});

describe("Part 2 — Subtask Management", () => {
  let state = INITIAL_STATE;

  beforeEach(() => {
    state = appReducer(INITIAL_STATE, { type: "START_SESSION", task: "Subtask Test" });
  });

  it("populates subtasks and designates the first step as active", () => {
    state = appReducer(state, {
      type: "SET_SUBTASKS",
      subtasks: [
        { title: "Review RFC", description: "Read spec", estimatedMinutes: 10, stepNumber: 1, isImmediateNextStep: true },
        { title: "Write tests", description: "Cover edges", estimatedMinutes: 15, stepNumber: 2, isImmediateNextStep: false },
      ],
    });

    expect(state.currentSession?.subtasks.length).toBe(2);
    expect(state.currentSession?.activeSubtaskId).toBe(state.currentSession?.subtasks[0].id);
    expect(state.currentSession?.subtasks[0].completed).toBe(false);
  });

  it("toggles subtask completion and advances active subtask to next uncompleted step", () => {
    state = appReducer(state, {
      type: "SET_SUBTASKS",
      subtasks: [
        { title: "Step 1", description: "First", estimatedMinutes: 10, stepNumber: 1, isImmediateNextStep: true },
        { title: "Step 2", description: "Second", estimatedMinutes: 15, stepNumber: 2, isImmediateNextStep: false },
        { title: "Step 3", description: "Third", estimatedMinutes: 20, stepNumber: 3, isImmediateNextStep: false },
      ],
    });

    const step1Id = state.currentSession!.subtasks[0].id;
    const step2Id = state.currentSession!.subtasks[1].id;

    // Complete step 1
    state = appReducer(state, { type: "TOGGLE_SUBTASK", id: step1Id });

    expect(state.currentSession?.subtasks[0].completed).toBe(true);
    expect(state.currentSession?.activeSubtaskId).toBe(step2Id);
  });

  it("allows selecting any uncompleted step as active step", () => {
    state = appReducer(state, {
      type: "SET_SUBTASKS",
      subtasks: [
        { title: "Step 1", description: "", estimatedMinutes: 10, stepNumber: 1, isImmediateNextStep: true },
        { title: "Step 2", description: "", estimatedMinutes: 15, stepNumber: 2, isImmediateNextStep: false },
      ],
    });

    const step2Id = state.currentSession!.subtasks[1].id;
    state = appReducer(state, { type: "SELECT_ACTIVE_SUBTASK", id: step2Id });

    expect(state.currentSession?.activeSubtaskId).toBe(step2Id);
  });
});

describe("Part 2 — Canonical Attention States & Non-Punitive Presentation", () => {
  const canonicalStates: AttentionState[] = [
    "FOCUSED",
    "POSSIBLY_DRIFTING",
    "DISTRACTED",
    "RECOVERING",
    "IDLE",
  ];

  it("supports all required canonical attention states with icon, label, and description", () => {
    for (const st of canonicalStates) {
      const config = ATTENTION_CONFIG[st];
      expect(config).toBeDefined();
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.description.length).toBeGreaterThan(0);
      expect(config.icon).toBeDefined();
      expect(config.dotColor).toBeDefined();

      // Ensure non-punitive, non-diagnostic wording (no clinical claims)
      const text = config.description.toLowerCase();
      expect(text).not.toContain("diagnosis");
      expect(text).not.toContain("disorder");
      expect(text).not.toContain("adhd");
      expect(text).not.toContain("failing");
    }
  });

  it("updates attention state from engine events", () => {
    const state = appReducer(INITIAL_STATE, {
      type: "UPDATE_ATTENTION",
      event: {
        eventId: "test-event-1",
        timestamp: new Date().toISOString(),
        attentionState: "DISTRACTED",
        confidence: 0.88,
        activeApp: {
          appName: "Browser",
          windowTitle: "Reddit",
          category: "entertainment",
        },
        metrics: {
          sessionDurationSeconds: 120,
          appDurationSeconds: 45,
          recentSwitchCount: 5,
          inactivitySeconds: 10,
        },
        sources: ["activity_monitor"],
      },
    });

    expect(state.currentAttentionState).toBe("DISTRACTED");
    expect(state.confidence).toBe(0.88);
  });
});

describe("Part 2 — Engine Disconnection Handling", () => {
  it("records engine disconnection status and displays informative error", () => {
    let state = appReducer(INITIAL_STATE, { type: "SET_ENGINE_CONNECTED", connected: true });
    expect(state.engineConnected).toBe(true);

    state = appReducer(state, { type: "SET_ENGINE_CONNECTED", connected: false });
    state = appReducer(state, { type: "SET_ERROR", error: "Lost connection to attention engine." });

    expect(state.engineConnected).toBe(false);
    expect(state.error).toBe("Lost connection to attention engine.");
  });

  it("MockEngineClient supports simulating disconnection and notifies error subscribers", async () => {
    const mockEngine = new MockEngineClient();
    let errorReceived: Error | null = null;

    mockEngine.subscribeToEvents(
      () => {},
      (err) => {
        errorReceived = err;
      }
    );

    mockEngine.simulateEngineUnavailable(true);

    expect(errorReceived).not.toBeNull();
    expect((errorReceived as Error | null)?.message).toContain("Engine service unavailable");

    await expect(mockEngine.getHealth()).rejects.toThrow("Engine service unavailable");
  });
});
