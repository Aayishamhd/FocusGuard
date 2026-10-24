/**
 * Mock Engine Client — synthetic attention event emitter for offline development.
 * Implements the same IEngineClient interface as LiveEngineClient.
 * Cycles through realistic attention states with configurable interval.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  AttentionEvent,
  AttentionState,
  EngineHealthResponse,
} from "../types/contracts";
import type { IEngineClient } from "./engineClient";

// ─── Synthetic scenario definitions ──────────────────────────────────────

interface ScenarioStep {
  state: AttentionState;
  appName: string;
  windowTitle: string;
  category: AttentionEvent["activeApp"]["category"];
  confidence: number;
  inactivitySeconds: number;
  recentSwitchCount: number;
}

const DEFAULT_SCENARIO: ScenarioStep[] = [
  {
    state: "FOCUSED",
    appName: "Code",
    windowTitle: "FocusGuard — desktop/src/renderer/src/App.tsx",
    category: "work",
    confidence: 0.92,
    inactivitySeconds: 2,
    recentSwitchCount: 1,
  },
  {
    state: "FOCUSED",
    appName: "Code",
    windowTitle: "FocusGuard — desktop/src/renderer/src/services/mockEngineClient.ts",
    category: "work",
    confidence: 0.88,
    inactivitySeconds: 1,
    recentSwitchCount: 2,
  },
  {
    state: "POSSIBLY_DRIFTING",
    appName: "Google Chrome",
    windowTitle: "Stack Overflow — TypeScript generics",
    category: "work",
    confidence: 0.74,
    inactivitySeconds: 8,
    recentSwitchCount: 3,
  },
  {
    state: "POSSIBLY_DRIFTING",
    appName: "Google Chrome",
    windowTitle: "YouTube — Lo-Fi Chill Beats",
    category: "entertainment",
    confidence: 0.71,
    inactivitySeconds: 15,
    recentSwitchCount: 4,
  },
  {
    state: "DISTRACTED",
    appName: "Google Chrome",
    windowTitle: "Reddit — r/programming",
    category: "entertainment",
    confidence: 0.85,
    inactivitySeconds: 20,
    recentSwitchCount: 6,
  },
  {
    state: "RECOVERING",
    appName: "Code",
    windowTitle: "FocusGuard — desktop/src/renderer/src/App.tsx",
    category: "work",
    confidence: 0.65,
    inactivitySeconds: 3,
    recentSwitchCount: 5,
  },
  {
    state: "FOCUSED",
    appName: "Code",
    windowTitle: "FocusGuard — dashboard refactor",
    category: "work",
    confidence: 0.91,
    inactivitySeconds: 1,
    recentSwitchCount: 2,
  },
];

// ─── Mock Engine Client ───────────────────────────────────────────────────

export class MockEngineClient implements IEngineClient {
  private isMonitoring = false;
  private scenarioIndex = 0;
  private sessionSeconds = 0;
  private intervalRef: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(event: AttentionEvent) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private readonly intervalMs: number;

  /** Manually override attention state for developer simulation */
  public forcedState: AttentionState | null = null;
  public isUnavailable: boolean = false;
  public responseDelayMs: number = 0;

  constructor(intervalMs = 4000) {
    this.intervalMs = intervalMs;
  }

  async getHealth(): Promise<EngineHealthResponse> {
    if (this.responseDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.responseDelayMs));
    }
    if (this.isUnavailable) {
      throw new Error("Engine service unavailable (simulated)");
    }
    return {
      status: "ok",
      webcamActive: false,
      trackingActive: this.isMonitoring,
    };
  }

  async getCurrentState(): Promise<AttentionEvent> {
    if (this.responseDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.responseDelayMs));
    }
    if (this.isUnavailable) {
      throw new Error("Engine service unavailable (simulated)");
    }
    if (this.forcedState) {
      return this.buildEventForState(this.forcedState);
    }
    return this.buildEvent();
  }

  async startMonitoring(): Promise<{ success: boolean }> {
    if (this.responseDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.responseDelayMs));
    }
    if (this.isUnavailable) {
      throw new Error("Engine service unavailable (simulated)");
    }
    if (this.isMonitoring) return { success: true };
    this.isMonitoring = true;
    this.intervalRef = setInterval(() => {
      this.tick();
    }, this.intervalMs);
    return { success: true };
  }

  async pauseMonitoring(): Promise<{ success: boolean }> {
    if (this.responseDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.responseDelayMs));
    }
    this.isMonitoring = false;
    if (this.intervalRef !== null) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    return { success: true };
  }

  subscribeToEvents(
    onEvent: (event: AttentionEvent) => void,
    onError?: (err: Error) => void
  ): () => void {
    this.listeners.push(onEvent);
    if (onError) this.errorListeners.push(onError);

    return () => {
      this.listeners = this.listeners.filter((l) => l !== onEvent);
      if (onError) this.errorListeners = this.errorListeners.filter((l) => l !== onError);
    };
  }

  // ─── Simulation Controls ────────────────────────────────────────────────

  public forceAttentionState(state: AttentionState): void {
    this.forcedState = state;
    const event = this.buildEventForState(state);
    this.listeners.forEach((l) => l(event));
  }

  public clearForcedState(): void {
    this.forcedState = null;
  }

  public simulateEngineUnavailable(unavailable: boolean): void {
    this.isUnavailable = unavailable;
    if (unavailable) {
      const err = new Error("Engine service unavailable (simulated)");
      this.errorListeners.forEach((l) => l(err));
    }
  }

  public setResponseDelay(delayMs: number): void {
    this.responseDelayMs = delayMs;
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private tick(): void {
    this.sessionSeconds += Math.round(this.intervalMs / 1000);

    const event = this.forcedState
      ? this.buildEventForState(this.forcedState)
      : this.buildEventFromStep(DEFAULT_SCENARIO[this.scenarioIndex]);

    this.listeners.forEach((l) => l(event));

    if (!this.forcedState) {
      this.scenarioIndex = (this.scenarioIndex + 1) % DEFAULT_SCENARIO.length;
    }
  }

  private buildEvent(): AttentionEvent {
    const step = DEFAULT_SCENARIO[this.scenarioIndex];
    return this.buildEventFromStep(step);
  }

  private buildEventForState(state: AttentionState): AttentionEvent {
    const confidenceMap: Record<AttentionState, number> = {
      FOCUSED: 0.94,
      POSSIBLY_DRIFTING: 0.72,
      DISTRACTED: 0.88,
      RECOVERING: 0.69,
      IDLE: 0.5,
    };

    return {
      eventId: `mock-sim-${uuidv4().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      attentionState: state,
      confidence: confidenceMap[state] ?? 0.8,
      activeApp: {
        appName: state === "DISTRACTED" ? "Social App" : "Code Editor",
        windowTitle: `FocusGuard Simulator — [${state}]`,
        category: state === "DISTRACTED" ? "entertainment" : "work",
      },
      metrics: {
        sessionDurationSeconds: this.sessionSeconds,
        appDurationSeconds: 120,
        recentSwitchCount: state === "DISTRACTED" ? 8 : 1,
        inactivitySeconds: state === "POSSIBLY_DRIFTING" ? 12 : 2,
        webcamEngaged: false,
      },
      sources: ["window_tracker", "activity_monitor"],
    };
  }

  private buildEventFromStep(step: ScenarioStep): AttentionEvent {
    return {
      eventId: `mock-${uuidv4().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      attentionState: step.state,
      confidence: step.confidence,
      activeApp: {
        appName: step.appName,
        windowTitle: step.windowTitle,
        category: step.category,
      },
      metrics: {
        sessionDurationSeconds: this.sessionSeconds,
        appDurationSeconds: Math.round(Math.random() * 300 + 30),
        recentSwitchCount: step.recentSwitchCount,
        inactivitySeconds: step.inactivitySeconds,
        webcamEngaged: false,
      },
      sources: ["window_tracker", "activity_monitor"],
    };
  }
}
