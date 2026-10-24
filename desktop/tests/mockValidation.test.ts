/**
 * Mock Validation Tests — verify that mock payloads conform to SHARED_CONTRACTS.md schemas.
 * Run: npm test (from desktop/)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockEngineClient } from "../src/renderer/src/services/mockEngineClient";
import { MockAssistantClient } from "../src/renderer/src/services/mockAssistantClient";

// ─── Mock uuid ────────────────────────────────────────────────────────────
vi.mock("uuid", () => ({ v4: () => "00000000-0000-0000-0000-000000000000" }));

// ─── Engine Mock Tests ────────────────────────────────────────────────────

describe("MockEngineClient", () => {
  let engine: MockEngineClient;

  beforeEach(() => {
    engine = new MockEngineClient(100);
  });

  it("getHealth returns correct shape", async () => {
    const health = await engine.getHealth();
    expect(health).toHaveProperty("status", "ok");
    expect(health).toHaveProperty("webcamActive");
    expect(typeof health.webcamActive).toBe("boolean");
  });

  it("getCurrentState returns a valid AttentionEvent", async () => {
    const event = await engine.getCurrentState();
    // Required top-level fields
    expect(typeof event.eventId).toBe("string");
    expect(typeof event.timestamp).toBe("string");
    expect(typeof event.confidence).toBe("number");
    expect(event.confidence).toBeGreaterThanOrEqual(0);
    expect(event.confidence).toBeLessThanOrEqual(1);

    // attentionState must be one of the valid enum values
    const validStates = ["FOCUSED", "POSSIBLY_DRIFTING", "DISTRACTED", "RECOVERING", "IDLE"];
    expect(validStates).toContain(event.attentionState);

    // activeApp
    expect(typeof event.activeApp.appName).toBe("string");
    expect(typeof event.activeApp.windowTitle).toBe("string");
    const validCategories = ["work", "communication", "entertainment", "utility", "unknown"];
    expect(validCategories).toContain(event.activeApp.category);

    // metrics
    expect(typeof event.metrics.sessionDurationSeconds).toBe("number");
    expect(typeof event.metrics.appDurationSeconds).toBe("number");
    expect(typeof event.metrics.recentSwitchCount).toBe("number");
    expect(typeof event.metrics.inactivitySeconds).toBe("number");

    // sources
    expect(Array.isArray(event.sources)).toBe(true);
  });

  it("startMonitoring returns success", async () => {
    const result = await engine.startMonitoring();
    expect(result).toEqual({ success: true });
  });

  it("pauseMonitoring returns success", async () => {
    await engine.startMonitoring();
    const result = await engine.pauseMonitoring();
    expect(result).toEqual({ success: true });
  });

  it("subscribeToEvents emits events and unsubscribes cleanly", async () => {
    const events: unknown[] = [];
    engine.startMonitoring().catch(() => {});
    const unsub = engine.subscribeToEvents((e) => events.push(e));
    await new Promise((r) => setTimeout(r, 250));
    unsub();
    const countAfterUnsub = events.length;
    await new Promise((r) => setTimeout(r, 250));
    expect(events.length).toBe(countAfterUnsub); // no more events after unsub
    expect(events.length).toBeGreaterThan(0);
    engine.pauseMonitoring().catch(() => {});
  });

  it("does not duplicate start if already monitoring", async () => {
    await engine.startMonitoring();
    const result = await engine.startMonitoring(); // Second call
    expect(result).toEqual({ success: true });
    await engine.pauseMonitoring();
  });
});

// ─── Assistant Mock Tests ─────────────────────────────────────────────────

describe("MockAssistantClient", () => {
  let assistant: MockAssistantClient;

  const baseEvent = {
    eventId: "test-001",
    timestamp: new Date().toISOString(),
    attentionState: "DISTRACTED" as const,
    confidence: 0.85,
    activeApp: { appName: "Chrome", windowTitle: "YouTube", category: "entertainment" as const },
    metrics: { sessionDurationSeconds: 300, appDurationSeconds: 120, recentSwitchCount: 5, inactivitySeconds: 10 },
    sources: ["window_tracker" as const],
  };

  beforeEach(() => {
    assistant = new MockAssistantClient();
  });

  it("getHealth returns valid shape", async () => {
    const health = await assistant.getHealth();
    expect(health.status).toBe("ok");
    expect(typeof health.llmConnected).toBe("boolean");
    expect(typeof health.model).toBe("string");
  });

  it("intervene returns valid InterventionDecision for DISTRACTED state", async () => {
    const decision = await assistant.intervene(baseEvent);
    expect(typeof decision.decisionId).toBe("string");
    expect(typeof decision.timestamp).toBe("string");
    expect(typeof decision.shouldIntervene).toBe("boolean");
    expect(typeof decision.triggerReason).toBe("string");

    const validLevels = [
      "LEVEL_0_NONE", "LEVEL_1_GENTLE_REMINDER", "LEVEL_2_RECOVERY_SUGGESTION",
      "LEVEL_3_ASSISTANCE", "LEVEL_4_BREAK_SUGGESTION"
    ];
    expect(validLevels).toContain(decision.level);

    if (decision.shouldIntervene) {
      expect(typeof decision.message).toBe("string");
      expect(Array.isArray(decision.actions)).toBe(true);
      if (decision.actions) {
        for (const action of decision.actions) {
          const validActions = ["return_to_task", "break_down_task", "take_break", "dismiss"];
          expect(validActions).toContain(action.actionId);
          expect(typeof action.label).toBe("string");
        }
      }
    }
  });

  it("intervene returns LEVEL_0_NONE for FOCUSED state", async () => {
    const focusedEvent = { ...baseEvent, attentionState: "FOCUSED" as const };
    const decision = await assistant.intervene(focusedEvent);
    expect(decision.level).toBe("LEVEL_0_NONE");
    expect(decision.shouldIntervene).toBe(false);
  });

  it("intervene returns LEVEL_4_BREAK_SUGGESTION for IDLE state and includes suggestedBreakMinutes", async () => {
    const idleEvent = { ...baseEvent, attentionState: "IDLE" as const };
    const decision = await assistant.intervene(idleEvent);
    expect(decision.level).toBe("LEVEL_4_BREAK_SUGGESTION");
    expect(typeof decision.suggestedBreakMinutes).toBe("number");
  });

  it("decompose returns valid TaskDecompositionResponse", async () => {
    const response = await assistant.decompose({ taskDescription: "Build the project report" });
    expect(response.originalTask).toBe("Build the project report");
    expect(Array.isArray(response.subtasks)).toBe(true);
    expect(response.subtasks.length).toBeGreaterThan(0);

    for (const subtask of response.subtasks) {
      expect(typeof subtask.stepNumber).toBe("number");
      expect(typeof subtask.title).toBe("string");
      expect(typeof subtask.description).toBe("string");
      expect(typeof subtask.estimatedMinutes).toBe("number");
      expect(typeof subtask.isImmediateNextStep).toBe("boolean");
    }

    // Exactly one isImmediateNextStep === true
    const immediateSteps = response.subtasks.filter((s) => s.isImmediateNextStep);
    expect(immediateSteps.length).toBe(1);
  });

  it("recover returns valid RecoveryFeedbackResponse for each reason", async () => {
    const reasons = ["tired", "task_confusing", "distracted", "need_break", "other"] as const;
    for (const reason of reasons) {
      const response = await assistant.recover({
        sessionId: "test-session",
        currentTask: "Write tests",
        userReason: reason,
      });
      const validRecs = ["take_break", "simplify_task", "resume_previous", "custom_tip"];
      expect(validRecs).toContain(response.recommendation);
      expect(typeof response.supportiveMessage).toBe("string");
      expect(response.supportiveMessage.length).toBeGreaterThan(0);
    }
  });
});
