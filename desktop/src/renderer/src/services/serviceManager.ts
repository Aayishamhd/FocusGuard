/**
 * Service Manager — selects live vs. mock implementations based on environment.
 *
 * Mock mode (default): VITE_USE_MOCKS is anything other than "false"
 * Live mode: set VITE_USE_MOCKS=false in desktop/.env.local
 *
 * Example .env.local to enable live backends:
 *   VITE_USE_MOCKS=false
 *   VITE_ENGINE_URL=http://127.0.0.1:5001
 *   VITE_ASSISTANT_URL=http://127.0.0.1:5002
 */

import { LiveEngineClient } from "./engineClient";
import type { IEngineClient } from "./engineClient";
import { LiveAssistantClient } from "./assistantClient";
import type { IAssistantClient } from "./assistantClient";
import { MockEngineClient } from "./mockEngineClient";
import { MockAssistantClient } from "./mockAssistantClient";

// ─── Environment config ────────────────────────────────────────────────────

/**
 * Resolve environment variable safely across Vite (import.meta.env) and
 * Node/Vitest (process.env) environments.
 */
function getEnv(key: string): string | undefined {
  // Vite renderer context
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env[key] as string | undefined;
  }
  // Node / Vitest context
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

let mockModeOverride: boolean | null = null;

export const getEngineUrl = (): string => getEnv("VITE_ENGINE_URL") ?? "http://127.0.0.1:5001";
export const getAssistantUrl = (): string => getEnv("VITE_ASSISTANT_URL") ?? "http://127.0.0.1:5002";

/**
 * Mock mode is ON unless VITE_USE_MOCKS is explicitly set to the string "false"
 * or overridden in runtime / test harness.
 */
export function isUsingMocks(): boolean {
  if (mockModeOverride !== null) return mockModeOverride;
  return getEnv("VITE_USE_MOCKS") !== "false";
}

export function setMockModeOverride(useMocks: boolean | null): void {
  mockModeOverride = useMocks;
  resetServices();
}

// ─── Service singletons ────────────────────────────────────────────────────

let _engineService: IEngineClient | null = null;
let _assistantService: IAssistantClient | null = null;

export function getEngineService(): IEngineClient {
  if (!_engineService) {
    _engineService = isUsingMocks()
      ? new MockEngineClient()
      : new LiveEngineClient(getEngineUrl());
  }
  return _engineService;
}

export function getAssistantService(): IAssistantClient {
  if (!_assistantService) {
    _assistantService = isUsingMocks()
      ? new MockAssistantClient()
      : new LiveAssistantClient(getAssistantUrl());
  }
  return _assistantService;
}

export function getMockEngineClient(): MockEngineClient | null {
  const service = getEngineService();
  return service instanceof MockEngineClient ? service : null;
}

export function getMockAssistantClient(): MockAssistantClient | null {
  const service = getAssistantService();
  return service instanceof MockAssistantClient ? service : null;
}

/** Check health status of both services concurrently */
export async function checkServicesHealth(): Promise<{
  engine: boolean;
  assistant: boolean;
  engineError?: string;
  assistantError?: string;
}> {
  const engine = getEngineService();
  const assistant = getAssistantService();

  const [engineRes, assistantRes] = await Promise.allSettled([
    engine.getHealth(),
    assistant.getHealth(),
  ]);

  return {
    engine: engineRes.status === "fulfilled" && engineRes.value.status === "ok",
    assistant: assistantRes.status === "fulfilled" && assistantRes.value.status === "ok",
    engineError: engineRes.status === "rejected" ? engineRes.reason?.message : undefined,
    assistantError: assistantRes.status === "rejected" ? assistantRes.reason?.message : undefined,
  };
}

/** Reset singletons — useful in tests */
export function resetServices(): void {
  _engineService = null;
  _assistantService = null;
}
