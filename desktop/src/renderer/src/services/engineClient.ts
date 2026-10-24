/**
 * Engine Client — typed service contract for Feature 1 (Attention Engine, port 5001).
 * Based strictly on docs/SHARED_CONTRACTS.md (Version 1.0.0 FROZEN).
 * 
 * Endpoints:
 * - GET  /health          -> EngineHealthResponse
 * - GET  /state/current   -> AttentionEvent
 * - GET  /events/stream   -> Server-Sent Events (SSE) streaming AttentionEvent
 * - POST /monitoring/start -> { success: boolean }
 * - POST /monitoring/pause -> { success: boolean }
 */

import type {
  AttentionEvent,
  AttentionState,
  EngineHealthResponse,
} from "../types/contracts";

export type EngineConnectionState = "connected" | "reconnecting" | "disconnected";

// ─── Interface ────────────────────────────────────────────────────────────

export interface IEngineClient {
  getHealth(): Promise<EngineHealthResponse>;
  getCurrentState(): Promise<AttentionEvent>;
  startMonitoring(): Promise<{ success: boolean }>;
  pauseMonitoring(): Promise<{ success: boolean }>;
  subscribeToEvents(
    onEvent: (event: AttentionEvent) => void,
    onError?: (err: Error) => void,
    onConnectionStateChange?: (state: EngineConnectionState) => void
  ): () => void; // Returns unsubscribe function
}

// ─── Schema Validator ──────────────────────────────────────────────────────

const VALID_ATTENTION_STATES: Set<AttentionState> = new Set([
  "FOCUSED",
  "POSSIBLY_DRIFTING",
  "DISTRACTED",
  "RECOVERING",
  "IDLE",
]);

export function isValidAttentionEvent(data: unknown): data is AttentionEvent {
  if (typeof data !== "object" || data === null) return false;
  const ev = data as Record<string, unknown>;

  if (typeof ev.eventId !== "string" || !ev.eventId.trim()) return false;
  if (typeof ev.timestamp !== "string" || !ev.timestamp.trim()) return false;
  if (!VALID_ATTENTION_STATES.has(ev.attentionState as AttentionState)) return false;
  if (typeof ev.confidence !== "number" || isNaN(ev.confidence)) return false;

  if (typeof ev.activeApp !== "object" || ev.activeApp === null) return false;
  const app = ev.activeApp as Record<string, unknown>;
  if (typeof app.appName !== "string") return false;
  if (typeof app.windowTitle !== "string") return false;

  if (typeof ev.metrics !== "object" || ev.metrics === null) return false;
  const metrics = ev.metrics as Record<string, unknown>;
  if (typeof metrics.sessionDurationSeconds !== "number") return false;

  return true;
}

// ─── Live Client (HTTP / SSE → Feature 1) ──────────────────────────────────

export class LiveEngineClient implements IEngineClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private seenEventIds = new Set<string>();
  private readonly maxTrackedEventIds = 200;

  constructor(
    baseUrl: string = "http://127.0.0.1:5001",
    timeoutMs: number = 6000
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Engine request timed out after ${this.timeoutMs}ms (${url})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async getHealth(): Promise<EngineHealthResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Engine health check failed (${res.status} ${res.statusText})`);
    }
    const data = await res.json() as unknown;
    if (typeof data !== "object" || data === null || !("status" in data)) {
      throw new Error("Invalid Engine health response: missing 'status' field");
    }
    return data as EngineHealthResponse;
  }

  async getCurrentState(): Promise<AttentionEvent> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/state/current`);
    if (!res.ok) {
      throw new Error(`Failed to fetch current attention state (${res.status} ${res.statusText})`);
    }
    const data = await res.json() as unknown;
    if (!isValidAttentionEvent(data)) {
      throw new Error("Received malformed AttentionEvent from Engine service");
    }
    return data;
  }

  async startMonitoring(): Promise<{ success: boolean }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/monitoring/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Failed to start monitoring (${res.status} ${res.statusText})`);
    }
    const data = (await res.json().catch(() => ({ success: true }))) as { success?: boolean };
    return { success: data.success !== false };
  }

  async pauseMonitoring(): Promise<{ success: boolean }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/monitoring/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Failed to pause monitoring (${res.status} ${res.statusText})`);
    }
    const data = (await res.json().catch(() => ({ success: true }))) as { success?: boolean };
    return { success: data.success !== false };
  }

  subscribeToEvents(
    onEvent: (event: AttentionEvent) => void,
    onError?: (err: Error) => void,
    onConnectionStateChange?: (state: EngineConnectionState) => void
  ): () => void {
    this.isDestroyed = false;
    let reconnectAttempts = 0;
    const maxBackoffMs = 15000;

    const connect = () => {
      if (this.isDestroyed) return;

      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      onConnectionStateChange?.(reconnectAttempts === 0 ? "connected" : "reconnecting");

      try {
        const streamUrl = `${this.baseUrl}/events/stream`;
        const es = new EventSource(streamUrl);
        this.eventSource = es;

        es.onopen = () => {
          reconnectAttempts = 0;
          onConnectionStateChange?.("connected");
        };

        es.onmessage = (e: MessageEvent) => {
          try {
            const raw = JSON.parse(e.data as string) as unknown;
            if (!isValidAttentionEvent(raw)) {
              onError?.(new Error("Malformed AttentionEvent received from SSE stream"));
              return;
            }

            // Deduplication: prevent duplicate processing of the same eventId
            if (this.seenEventIds.has(raw.eventId)) {
              return;
            }

            this.seenEventIds.add(raw.eventId);
            if (this.seenEventIds.size > this.maxTrackedEventIds) {
              // Trim oldest entries
              const first = this.seenEventIds.values().next().value;
              if (first) this.seenEventIds.delete(first);
            }

            onEvent(raw);
          } catch {
            onError?.(new Error("Failed to parse SSE event JSON"));
          }
        };

        es.onerror = () => {
          es.close();
          this.eventSource = null;
          onConnectionStateChange?.("reconnecting");
          onError?.(new Error("Engine SSE stream disconnected, reconnecting..."));

          if (this.isDestroyed) return;

          // Exponential backoff reconnect
          const backoff = Math.min(1000 * Math.pow(2, reconnectAttempts), maxBackoffMs);
          reconnectAttempts += 1;

          this.reconnectTimer = setTimeout(() => {
            connect();
          }, backoff);
        };
      } catch (err) {
        onConnectionStateChange?.("disconnected");
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    connect();

    // Return cleanup unsubscribe function
    return () => {
      this.isDestroyed = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      onConnectionStateChange?.("disconnected");
    };
  }
}
