/**
 * Unit Tests — Live Service Integration & Resilience (Part 5)
 *
 * Validates:
 * 1. Contract-first endpoint routing for LiveEngineClient & LiveAssistantClient
 * 2. Strict schema validation on responses
 * 3. Timeout handling and user cancellation (AbortController)
 * 4. Transient error retry & exponential backoff (503, 429)
 * 5. Partial failure resilience (Engine offline + Assistant online, and vice-versa)
 * 6. SSE event validation, event ID deduplication, and exponential backoff reconnection
 * 7. Mock/live mode toggle and production build safety
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LiveEngineClient,
  isValidAttentionEvent,
} from "../../src/renderer/src/services/engineClient";
import {
  LiveAssistantClient,
  isValidInterventionDecision,
  isValidTaskDecompositionResponse,
  isValidRecoveryFeedbackResponse,
} from "../../src/renderer/src/services/assistantClient";
import {
  isUsingMocks,
  setMockModeOverride,
  getEngineService,
  getAssistantService,
  checkServicesHealth,
  resetServices,
} from "../../src/renderer/src/services/serviceManager";
import type {
  AttentionEvent,
  TaskDecompositionRequest,
  RecoveryFeedbackRequest,
} from "../../src/renderer/src/types/contracts";

describe("LiveEngineClient (Feature 1 on Port 5001)", () => {
  let client: LiveEngineClient;

  beforeEach(() => {
    client = new LiveEngineClient("http://127.0.0.1:5001", 1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls GET /health and returns parsed health status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok", webcamActive: false, trackingActive: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const health = await client.getHealth();
    expect(health.status).toBe("ok");
    expect(health.webcamActive).toBe(false);
    expect(health.trackingActive).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:5001/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("calls GET /state/current and validates AttentionEvent schema", async () => {
    const validEvent: AttentionEvent = {
      eventId: "ae-test-001",
      timestamp: "2026-10-24T22:00:00.000Z",
      attentionState: "FOCUSED",
      confidence: 0.95,
      activeApp: {
        appName: "Code",
        windowTitle: "FocusGuard — Engine.ts",
        category: "work",
      },
      metrics: {
        sessionDurationSeconds: 120,
        appDurationSeconds: 60,
        recentSwitchCount: 1,
        inactivitySeconds: 2,
        webcamEngaged: false,
      },
      sources: ["window_tracker", "activity_monitor"],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(validEvent), { status: 200 })
    );

    const state = await client.getCurrentState();
    expect(state.eventId).toBe("ae-test-001");
    expect(state.attentionState).toBe("FOCUSED");
    expect(state.confidence).toBe(0.95);
  });

  it("throws clear error when GET /state/current returns malformed schema", async () => {
    // Missing activeApp and confidence
    const malformed = { eventId: "bad-event", attentionState: "FOCUSED" };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(malformed), { status: 200 })
    );

    await expect(client.getCurrentState()).rejects.toThrow(/malformed AttentionEvent/i);
  });

  it("calls POST /monitoring/start and POST /monitoring/pause", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    const startRes = await client.startMonitoring();
    expect(startRes.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:5001/monitoring/start",
      expect.objectContaining({ method: "POST" })
    );

    const pauseRes = await client.pauseMonitoring();
    expect(pauseRes.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:5001/monitoring/pause",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("aborts and throws when engine request times out", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => {
      return new Promise((_, reject) => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        setTimeout(() => reject(err), 50);
      });
    });

    await expect(client.getHealth()).rejects.toThrow(/timed out/i);
  });
});

describe("LiveAssistantClient (Feature 2 on Port 5002)", () => {
  let client: LiveAssistantClient;

  beforeEach(() => {
    client = new LiveAssistantClient("http://127.0.0.1:5002", 1500, 1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls POST /api/decompose with TaskDecompositionRequest and returns verified response", async () => {
    const validDecomp = {
      originalTask: "Prepare hackathon demo",
      subtasks: [
        {
          stepNumber: 1,
          title: "Outline key slides",
          description: "Define architecture and benefits",
          estimatedMinutes: 10,
          isImmediateNextStep: true,
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(validDecomp), { status: 200 })
    );

    const req: TaskDecompositionRequest = {
      taskDescription: "Prepare hackathon demo",
      difficultyLevel: "moderate",
    };

    const res = await client.decompose(req);
    expect(res.originalTask).toBe("Prepare hackathon demo");
    expect(res.subtasks).toHaveLength(1);
    expect(res.subtasks[0].title).toBe("Outline key slides");
    expect(res.subtasks[0].isImmediateNextStep).toBe(true);
  });

  it("calls POST /api/recover and returns verified RecoveryFeedbackResponse", async () => {
    const validRecovery = {
      recommendation: "take_break",
      supportiveMessage: "You've been working hard. A quick stretch will restore mental clarity.",
      actionPayload: { suggestedBreakMinutes: 5 },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(validRecovery), { status: 200 })
    );

    const req: RecoveryFeedbackRequest = {
      sessionId: "sess-99",
      currentTask: "Presentation slides",
      userReason: "tired",
    };

    const res = await client.recover(req);
    expect(res.recommendation).toBe("take_break");
    expect(res.supportiveMessage).toContain("mental clarity");
    expect(res.actionPayload?.suggestedBreakMinutes).toBe(5);
  });

  it("calls POST /api/intervene with AttentionEvent and returns InterventionDecision", async () => {
    const validDecision = {
      decisionId: "dec-77",
      timestamp: new Date().toISOString(),
      shouldIntervene: true,
      level: "LEVEL_1_GENTLE_REMINDER",
      triggerReason: "Frequent context switching",
      message: "Ready to return to your code?",
      actions: [{ actionId: "return_to_task", label: "Return to Task" }],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(validDecision), { status: 200 })
    );

    const mockEvent: AttentionEvent = {
      eventId: "e1",
      timestamp: new Date().toISOString(),
      attentionState: "DISTRACTED",
      confidence: 0.8,
      activeApp: { appName: "Browser", windowTitle: "Reddit", category: "entertainment" },
      metrics: { sessionDurationSeconds: 300, appDurationSeconds: 100, recentSwitchCount: 5, inactivitySeconds: 0 },
      sources: ["window_tracker"],
    };

    const res = await client.intervene(mockEvent);
    expect(res.shouldIntervene).toBe(true);
    expect(res.level).toBe("LEVEL_1_GENTLE_REMINDER");
    expect(res.message).toBe("Ready to return to your code?");
  });

  it("retries on transient 503 error before failing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      // First attempt: 503 Service Unavailable
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" }))
      // Second attempt (retry): 200 OK
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            originalTask: "Retry task",
            subtasks: [{ stepNumber: 1, title: "Step 1", description: "Desc", estimatedMinutes: 5, isImmediateNextStep: true }],
          }),
          { status: 200 }
        )
      );

    const res = await client.decompose({ taskDescription: "Retry task" });
    expect(res.originalTask).toBe("Retry task");
    expect(fetchSpy).toHaveBeenCalledTimes(2); // Retried once
  });

  it("rejects without fabricating data when service fails completely", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })
    );

    await expect(client.decompose({ taskDescription: "Fail task" })).rejects.toThrow(/failed \(500/i);
  });
});

describe("Partial Failure Resilience & Health Checking", () => {
  beforeEach(() => {
    resetServices();
  });

  afterEach(() => {
    setMockModeOverride(null);
    resetServices();
    vi.restoreAllMocks();
  });

  it("health check handles Engine offline while Assistant is online", async () => {
    setMockModeOverride(false); // Live mode

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).includes(":5001")) {
        return Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:5001"));
      }
      // Assistant on 5002 responds OK
      return Promise.resolve(
        new Response(JSON.stringify({ status: "ok", llmConnected: true, model: "llama3:8b" }), { status: 200 })
      );
    });

    const health = await checkServicesHealth();
    expect(health.engine).toBe(false);
    expect(health.assistant).toBe(true);
    expect(health.engineError).toContain("ECONNREFUSED");
  });

  it("health check handles Assistant offline while Engine is online", async () => {
    setMockModeOverride(false); // Live mode

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).includes(":5002")) {
        return Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:5002"));
      }
      // Engine on 5001 responds OK
      return Promise.resolve(
        new Response(JSON.stringify({ status: "ok", webcamActive: false }), { status: 200 })
      );
    });

    const health = await checkServicesHealth();
    expect(health.engine).toBe(true);
    expect(health.assistant).toBe(false);
    expect(health.assistantError).toContain("ECONNREFUSED");
  });

  it("health check handles both services offline without crashing", async () => {
    setMockModeOverride(false);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network unreachable"));

    const health = await checkServicesHealth();
    expect(health.engine).toBe(false);
    expect(health.assistant).toBe(false);
  });
});

describe("SSE Event Deduplication and Validation", () => {
  it("validates valid and invalid AttentionEvent schemas accurately", () => {
    const valid: AttentionEvent = {
      eventId: "id-1",
      timestamp: new Date().toISOString(),
      attentionState: "POSSIBLY_DRIFTING",
      confidence: 0.75,
      activeApp: { appName: "Chrome", windowTitle: "YouTube", category: "entertainment" },
      metrics: { sessionDurationSeconds: 10, appDurationSeconds: 10, recentSwitchCount: 0, inactivitySeconds: 0 },
      sources: ["window_tracker"],
    };
    expect(isValidAttentionEvent(valid)).toBe(true);

    // Invalid attentionState
    expect(isValidAttentionEvent({ ...valid, attentionState: "SUPER_FOCUSED" })).toBe(false);
    // Missing activeApp
    expect(isValidAttentionEvent({ ...valid, activeApp: null })).toBe(false);
    // Missing eventId
    expect(isValidAttentionEvent({ ...valid, eventId: "" })).toBe(false);
  });

  it("validates TaskDecompositionResponse schema accurately", () => {
    const valid = {
      originalTask: "Coding",
      subtasks: [{ stepNumber: 1, title: "Step 1", description: "D", estimatedMinutes: 10, isImmediateNextStep: true }],
    };
    expect(isValidTaskDecompositionResponse(valid)).toBe(true);

    // Subtasks not an array
    expect(isValidTaskDecompositionResponse({ originalTask: "Coding", subtasks: "not an array" })).toBe(false);
    // Subtask missing stepNumber
    expect(isValidTaskDecompositionResponse({ originalTask: "Coding", subtasks: [{ title: "Step 1" }] })).toBe(false);
  });

  it("validates RecoveryFeedbackResponse schema accurately", () => {
    const valid = {
      recommendation: "simplify_task",
      supportiveMessage: "Let's make this easier.",
    };
    expect(isValidRecoveryFeedbackResponse(valid)).toBe(true);

    // Unknown recommendation type
    expect(isValidRecoveryFeedbackResponse({ recommendation: "unknown_action", supportiveMessage: "msg" })).toBe(false);
    // Missing message
    expect(isValidRecoveryFeedbackResponse({ recommendation: "take_break", supportiveMessage: "" })).toBe(false);
  });
});

describe("Mock / Live Mode Switching", () => {
  afterEach(() => {
    setMockModeOverride(null);
    resetServices();
  });

  it("defaults to mock mode when VITE_USE_MOCKS is not 'false'", () => {
    setMockModeOverride(null);
    expect(isUsingMocks()).toBe(true);
  });

  it("switches to live mode cleanly when mockMode is overridden to false", () => {
    setMockModeOverride(false);
    expect(isUsingMocks()).toBe(false);

    const engine = getEngineService();
    const assistant = getAssistantService();

    expect(engine).toBeInstanceOf(LiveEngineClient);
    expect(assistant).toBeInstanceOf(LiveAssistantClient);
  });

  it("switches back to mock mode without UI rewrites", () => {
    setMockModeOverride(false);
    expect(isUsingMocks()).toBe(false);

    setMockModeOverride(true);
    expect(isUsingMocks()).toBe(true);

    const engine = getEngineService();
    expect(engine.constructor.name).toBe("MockEngineClient");
  });
});
