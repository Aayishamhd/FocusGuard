/**
 * Assistant Client — typed service contract for Feature 2 (AI Assistant, port 5002).
 * Based strictly on docs/SHARED_CONTRACTS.md (Version 1.0.0 FROZEN).
 *
 * Endpoints:
 * - GET  /health          -> AssistantHealthResponse
 * - POST /api/intervene   -> InterventionDecision
 * - POST /api/decompose   -> TaskDecompositionResponse
 * - POST /api/recover     -> RecoveryFeedbackResponse
 *
 * Resilience:
 * - Strict schema validation on all responses before passing to the UI.
 * - Configurable request timeouts via AbortController.
 * - Automatic retry with exponential backoff on transient errors (503, 429, ECONNREFUSED).
 * - Honest error reporting: never silently replaces live failures with fabricated success data.
 */

import type {
  AttentionEvent,
  AssistantHealthResponse,
  InterventionDecision,
  InterventionLevel,
  TaskDecompositionRequest,
  TaskDecompositionResponse,
  RecoveryFeedbackRequest,
  RecoveryFeedbackResponse,
  SubTask,
} from "../types/contracts";

// ─── Interface ────────────────────────────────────────────────────────────

export interface IAssistantClient {
  getHealth(signal?: AbortSignal): Promise<AssistantHealthResponse>;
  intervene(event: AttentionEvent, signal?: AbortSignal): Promise<InterventionDecision>;
  decompose(request: TaskDecompositionRequest, signal?: AbortSignal): Promise<TaskDecompositionResponse>;
  recover(request: RecoveryFeedbackRequest, signal?: AbortSignal): Promise<RecoveryFeedbackResponse>;
}

// ─── Validators ────────────────────────────────────────────────────────────

const VALID_INTERVENTION_LEVELS: Set<InterventionLevel> = new Set([
  "LEVEL_0_NONE",
  "LEVEL_1_GENTLE_REMINDER",
  "LEVEL_2_RECOVERY_SUGGESTION",
  "LEVEL_3_ASSISTANCE",
  "LEVEL_4_BREAK_SUGGESTION",
]);

export function isValidInterventionDecision(data: unknown): data is InterventionDecision {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;

  if (typeof d.decisionId !== "string" || !d.decisionId.trim()) return false;
  if (typeof d.timestamp !== "string" || !d.timestamp.trim()) return false;
  if (typeof d.shouldIntervene !== "boolean") return false;
  if (!VALID_INTERVENTION_LEVELS.has(d.level as InterventionLevel)) return false;
  if (typeof d.triggerReason !== "string") return false;

  if (d.actions !== undefined && !Array.isArray(d.actions)) return false;

  return true;
}

export function isValidTaskDecompositionResponse(data: unknown): data is TaskDecompositionResponse {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;

  if (typeof d.originalTask !== "string") return false;
  if (!Array.isArray(d.subtasks)) return false;

  for (const st of d.subtasks as unknown[]) {
    if (typeof st !== "object" || st === null) return false;
    const item = st as Partial<SubTask>;
    if (typeof item.stepNumber !== "number") return false;
    if (typeof item.title !== "string" || !item.title.trim()) return false;
  }

  return true;
}

export function isValidRecoveryFeedbackResponse(data: unknown): data is RecoveryFeedbackResponse {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;

  const validRecs = ["take_break", "simplify_task", "resume_previous", "custom_tip"];
  if (typeof d.recommendation !== "string" || !validRecs.includes(d.recommendation)) return false;
  if (typeof d.supportiveMessage !== "string" || !d.supportiveMessage.trim()) return false;

  return true;
}

// ─── Live Client (HTTP REST → Feature 2) ──────────────────────────────────

export class LiveAssistantClient implements IAssistantClient {
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    baseUrl: string = "http://127.0.0.1:5002",
    defaultTimeoutMs: number = 10000,
    maxRetries: number = 2
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.maxRetries = maxRetries;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * HTTP POST helper with timeout, abort support, and retry for transient failures.
   */
  private async postWithRetry<T>(
    endpoint: string,
    body: unknown,
    validator: (data: unknown) => data is T,
    timeoutMs: number = this.defaultTimeoutMs,
    externalSignal?: AbortSignal
  ): Promise<T> {
    let attempts = 0;
    const url = `${this.baseUrl}${endpoint}`;

    while (attempts <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // Link external signal to controller if provided
      if (externalSignal) {
        externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok) {
          const isTransient = res.status === 503 || res.status === 429 || res.status === 502 || res.status === 504;
          const errorText = await res.text().catch(() => "");

          if (isTransient && attempts < this.maxRetries) {
            attempts += 1;
            const delay = 400 * Math.pow(2, attempts);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          throw new Error(`Assistant request to ${endpoint} failed (${res.status} ${res.statusText}): ${errorText || "Service error"}`);
        }

        const json = await res.json() as unknown;
        if (!validator(json)) {
          throw new Error(`Assistant ${endpoint} response failed contract schema validation`);
        }

        return json;
      } catch (err: unknown) {
        clearTimeout(timer);

        if (err instanceof Error && err.name === "AbortError") {
          if (externalSignal?.aborted) {
            throw new Error(`Assistant request cancelled by user (${endpoint})`);
          }
          throw new Error(`Assistant request timed out after ${timeoutMs}ms (${endpoint})`);
        }

        // Retry on network errors
        if (attempts < this.maxRetries && !(err instanceof Error && err.message.includes("schema validation"))) {
          attempts += 1;
          const delay = 400 * Math.pow(2, attempts);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw err;
      }
    }

    throw new Error(`Assistant ${endpoint} request failed after ${this.maxRetries} retries`);
  }

  async getHealth(signal?: AbortSignal): Promise<AssistantHealthResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Assistant health check failed (${res.status} ${res.statusText})`);
      }
      const data = await res.json() as unknown;
      if (typeof data !== "object" || data === null || !("status" in data)) {
        throw new Error("Invalid Assistant health response: missing 'status' field");
      }
      return data as AssistantHealthResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  async intervene(event: AttentionEvent, signal?: AbortSignal): Promise<InterventionDecision> {
    return this.postWithRetry<InterventionDecision>(
      "/api/intervene",
      event,
      isValidInterventionDecision,
      6000,
      signal
    );
  }

  async decompose(
    request: TaskDecompositionRequest,
    signal?: AbortSignal
  ): Promise<TaskDecompositionResponse> {
    // Task decomposition routes through Ollama/LLM in Feature 2, allow up to 15s timeout
    return this.postWithRetry<TaskDecompositionResponse>(
      "/api/decompose",
      request,
      isValidTaskDecompositionResponse,
      15000,
      signal
    );
  }

  async recover(
    request: RecoveryFeedbackRequest,
    signal?: AbortSignal
  ): Promise<RecoveryFeedbackResponse> {
    return this.postWithRetry<RecoveryFeedbackResponse>(
      "/api/recover",
      request,
      isValidRecoveryFeedbackResponse,
      10000,
      signal
    );
  }
}
