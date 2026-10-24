/**
 * Service Manager Tests — verify mock/live selection and singleton logic.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MockEngineClient } from "../../src/renderer/src/services/mockEngineClient";
import { MockAssistantClient } from "../../src/renderer/src/services/mockAssistantClient";
import {
  getEngineService,
  getAssistantService,
  isUsingMocks,
  resetServices,
} from "../../src/renderer/src/services/serviceManager";

vi.mock("uuid", () => ({ v4: () => "00000000-0000-0000-0000-000000000000" }));

describe("Service Manager — mock client behavior", () => {
  beforeEach(() => {
    resetServices();
  });

  afterEach(() => {
    resetServices();
  });

  it("isUsingMocks returns a boolean", () => {
    expect(typeof isUsingMocks()).toBe("boolean");
  });

  it("getEngineService returns an object implementing IEngineClient", () => {
    const engine = getEngineService();
    expect(typeof engine.getHealth).toBe("function");
    expect(typeof engine.getCurrentState).toBe("function");
    expect(typeof engine.startMonitoring).toBe("function");
    expect(typeof engine.pauseMonitoring).toBe("function");
    expect(typeof engine.subscribeToEvents).toBe("function");
  });

  it("getAssistantService returns an object implementing IAssistantClient", () => {
    const assistant = getAssistantService();
    expect(typeof assistant.getHealth).toBe("function");
    expect(typeof assistant.intervene).toBe("function");
    expect(typeof assistant.decompose).toBe("function");
    expect(typeof assistant.recover).toBe("function");
  });

  it("getEngineService returns same instance on repeated calls (singleton)", () => {
    const a = getEngineService();
    const b = getEngineService();
    expect(a).toBe(b);
  });

  it("getAssistantService returns same instance on repeated calls (singleton)", () => {
    const a = getAssistantService();
    const b = getAssistantService();
    expect(a).toBe(b);
  });

  it("resetServices causes new instances to be returned", () => {
    const engineA = getEngineService();
    const assistantA = getAssistantService();
    resetServices();
    const engineB = getEngineService();
    const assistantB = getAssistantService();
    expect(engineA).not.toBe(engineB);
    expect(assistantA).not.toBe(assistantB);
  });

  it("in default test environment, mock clients respond without network calls", async () => {
    const engine = getEngineService();
    const assistant = getAssistantService();

    // These should resolve without any real HTTP requests
    const engineHealth = await engine.getHealth();
    expect(engineHealth.status).toBe("ok");

    const assistantHealth = await assistant.getHealth();
    expect(assistantHealth.status).toBe("ok");
  });

  it("mock engine client is instance of MockEngineClient when mocks active", () => {
    // In test environment VITE_USE_MOCKS !== "false" so mocks should be active
    const engine = getEngineService();
    if (isUsingMocks()) {
      expect(engine).toBeInstanceOf(MockEngineClient);
    }
  });

  it("mock assistant client is instance of MockAssistantClient when mocks active", () => {
    const assistant = getAssistantService();
    if (isUsingMocks()) {
      expect(assistant).toBeInstanceOf(MockAssistantClient);
    }
  });
});
