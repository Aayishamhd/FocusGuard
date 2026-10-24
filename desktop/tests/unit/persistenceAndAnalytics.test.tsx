/**
 * Unit Tests — Analytics Calculation, Positive Insights & Settings/Privacy UI
 *
 * Validates:
 * 1. Analytics calculation & paused-time exclusion
 * 2. Empty-state handling ("Not enough data yet")
 * 3. Daily 7-day focus trends & weekly comparisons
 * 4. Human-centered positive insights generation
 * 5. Analytics UI rendering (empty state vs populated state)
 * 6. Settings & Privacy Center toggles (webcam default off, notifications)
 * 7. Monitoring pause coordination with engine service
 * 8. Error display when engine service cannot be reached
 * 9. "Clear All Stored History" confirmation modal and purge execution
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  calculateAnalytics,
  generateInsights,
} from "../../src/renderer/src/services/analyticsService";
import { storageService } from "../../src/renderer/src/services/storageService";
import { Analytics } from "../../src/renderer/src/pages/Analytics";
import { Settings } from "../../src/renderer/src/pages/Settings";
import { AppProvider } from "../../src/renderer/src/store/appStore";
import { getEngineService } from "../../src/renderer/src/services/serviceManager";
import type { StoredSessionRecord, StoredInterventionRecord } from "../../src/renderer/src/types/app";

// Mock localStorage
const mockStorage: Record<string, string> = {};
beforeEach(() => {
  for (const k in mockStorage) delete mockStorage[k];
  vi.spyOn(window.localStorage, "getItem").mockImplementation((key) => mockStorage[key] || null);
  vi.spyOn(window.localStorage, "setItem").mockImplementation((key, val) => {
    mockStorage[key] = val;
  });
  vi.spyOn(window.localStorage, "removeItem").mockImplementation((key) => {
    delete mockStorage[key];
  });
});

describe("Analytics Service Calculations", () => {
  it("handles empty sessions with 'hasEnoughData: false' and zero values", () => {
    const summary = calculateAnalytics([]);
    expect(summary.hasEnoughData).toBe(false);
    expect(summary.totalFocusMinutes).toBe(0);
    expect(summary.totalFragmentedMinutes).toBe(0);
    expect(summary.completedSessions).toBe(0);
    expect(summary.longestUninterruptedMinutes).toBe(0);
    expect(summary.insights).toEqual([]);
  });

  it("calculates active focus time strictly excluding paused intervals", () => {
    const sessions: StoredSessionRecord[] = [
      {
        id: "s1",
        task: "Task 1",
        startTime: "2026-10-24T09:00:00.000Z",
        startedAt: Date.now() - 3600000,
        totalFocusSeconds: 1800, // 30 minutes active
        totalPausedSeconds: 600,  // 10 minutes paused (must not be added to focus)
        pauseCount: 2,
        recoveryCount: 1,
        status: "completed",
      },
      {
        id: "s2",
        task: "Task 2",
        startTime: "2026-10-24T14:00:00.000Z",
        startedAt: Date.now() - 1800000,
        totalFocusSeconds: 1200, // 20 minutes active
        totalPausedSeconds: 0,
        pauseCount: 0,
        recoveryCount: 0,
        status: "completed",
      },
    ];

    const summary = calculateAnalytics(sessions);
    expect(summary.hasEnoughData).toBe(true);
    expect(summary.totalFocusSeconds).toBe(3000); // 1800 + 1200 = 50 minutes
    expect(summary.totalFocusMinutes).toBe(50);
    // Fragmented time = 600s paused + 1 recovery * 60s = 660s = 11 mins
    expect(summary.totalFragmentedMinutes).toBe(11);
    expect(summary.completedSessions).toBe(2);
    expect(summary.totalRecoveries).toBe(1);
    // Session s2 had zero pauses and zero recoveries, duration = 1200s (20 mins)
    expect(summary.longestUninterruptedMinutes).toBe(20);
  });

  it("generates positive, supportive insights derived from measured records", () => {
    const sessions: StoredSessionRecord[] = [
      {
        id: "s1",
        task: "Deep presentation design",
        startTime: new Date().toISOString(),
        startedAt: Date.now() - 2700000,
        totalFocusSeconds: 2520, // 42 minutes uninterrupted
        totalPausedSeconds: 0,
        pauseCount: 0,
        recoveryCount: 0,
        status: "completed",
      },
      {
        id: "s2",
        task: "Review documentation",
        startTime: new Date().toISOString(),
        startedAt: Date.now() - 900000,
        totalFocusSeconds: 900, // 15 mins
        totalPausedSeconds: 120,
        pauseCount: 1,
        recoveryCount: 2,
        status: "completed",
      },
    ];

    const summary = calculateAnalytics(sessions);
    expect(summary.insights.length).toBeGreaterThan(0);
    // Longest uninterrupted session: 42 minutes
    expect(summary.insights.some((i) => i.includes("42 minutes"))).toBe(true);
    // Completed 2 focus sessions today
    expect(summary.insights.some((i) => i.includes("2 focus sessions today"))).toBe(true);
    // Total recoveries = 2, self-correction recognized
    expect(summary.insights.some((i) => i.includes("refocused 2 times"))).toBe(true);
  });
});

describe("Analytics UI Component", () => {
  it("renders 'Not enough data yet' empty state when no sessions exist", async () => {
    vi.spyOn(storageService, "getSessions").mockResolvedValue([]);
    vi.spyOn(storageService, "getInterventions").mockResolvedValue([]);

    render(
      <AppProvider>
        <Analytics />
      </AppProvider>
    );

    expect(await screen.findByText(/Not enough data yet/i)).toBeInTheDocument();
    expect(screen.getByText(/needs at least one completed focus session/i)).toBeInTheDocument();
  });

  it("renders metrics, 7-day trend chart, and positive insights when sessions exist", async () => {
    const mockSessions: StoredSessionRecord[] = [
      {
        id: "sess-ui-1",
        task: "Write unit tests for desktop app",
        startTime: new Date().toISOString(),
        startedAt: Date.now() - 1800000,
        totalFocusSeconds: 1800, // 30m
        totalPausedSeconds: 180,
        pauseCount: 1,
        recoveryCount: 1,
        status: "completed",
      },
    ];

    vi.spyOn(storageService, "getSessions").mockResolvedValue(mockSessions);
    vi.spyOn(storageService, "getInterventions").mockResolvedValue([]);

    render(
      <AppProvider>
        <Analytics />
      </AppProvider>
    );

    // Wait for data load
    expect(await screen.findByText("Total Focused Time")).toBeInTheDocument();
    expect(screen.getAllByText("30m").length).toBeGreaterThan(0); // total focus value, bar, and table
    expect(screen.getByText("Completed Sessions")).toBeInTheDocument();
    expect(screen.getByText("Positive Patterns & Reflections")).toBeInTheDocument();
    expect(screen.getByText("Write unit tests for desktop app")).toBeInTheDocument();
  });
});

describe("Settings & Privacy Center UI Component", () => {
  it("defaults webcam monitoring to OFF and toggles correctly", async () => {
    render(
      <AppProvider>
        <Settings />
      </AppProvider>
    );

    const webcamToggle = screen.getByRole("switch", { name: /Toggle webcam/i });
    expect(webcamToggle).toHaveAttribute("aria-checked", "false"); // Default to off
    expect(screen.getByText(/Defaults to Off/i)).toBeInTheDocument();

    // Toggle on
    await userEvent.click(webcamToggle);
    expect(webcamToggle).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText(/Webcam preference active/i)).toBeInTheDocument();
  });

  it("toggles notification preferences", async () => {
    render(
      <AppProvider>
        <Settings />
      </AppProvider>
    );

    const notifToggle = screen.getByRole("switch", { name: /Toggle notifications/i });
    expect(notifToggle).toHaveAttribute("aria-checked", "true"); // Default to true

    await userEvent.click(notifToggle);
    expect(notifToggle).toHaveAttribute("aria-checked", "false");
  });

  it("coordinates monitoring pause and resume with engine service", async () => {
    const engine = getEngineService();
    const pauseSpy = vi.spyOn(engine, "pauseMonitoring").mockResolvedValue({ success: true });
    const startSpy = vi.spyOn(engine, "startMonitoring").mockResolvedValue({ success: true });

    render(
      <AppProvider>
        <Settings />
      </AppProvider>
    );

    const pauseBtn = screen.getByRole("button", { name: /Pause Monitoring/i });
    await userEvent.click(pauseBtn);

    expect(pauseSpy).toHaveBeenCalled();
    expect(await screen.findByText(/Engine monitoring paused/i)).toBeInTheDocument();

    // Resume button
    const resumeBtn = screen.getByRole("button", { name: /Resume Monitoring/i });
    await userEvent.click(resumeBtn);

    expect(startSpy).toHaveBeenCalled();
    expect(await screen.findByText(/Engine monitoring resumed successfully/i)).toBeInTheDocument();
  });

  it("displays a clear error when engine service fails during pause", async () => {
    const engine = getEngineService();
    vi.spyOn(engine, "pauseMonitoring").mockRejectedValue(new Error("Connection refused (ECONNREFUSED)"));

    render(
      <AppProvider>
        <Settings />
      </AppProvider>
    );

    const pauseBtn = screen.getByRole("button", { name: /Pause Monitoring/i });
    await userEvent.click(pauseBtn);

    expect(await screen.findByText(/Unable to coordinate with Engine service/i)).toBeInTheDocument();
    expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
  });

  it("opens confirmation modal for 'Clear All Stored History' and purges on confirm", async () => {
    const clearSpy = vi.spyOn(storageService, "clearHistory").mockResolvedValue({
      success: true,
      clearedSessions: 3,
      clearedInterventions: 2,
      preferencesReset: false,
    });

    render(
      <AppProvider>
        <Settings />
      </AppProvider>
    );

    // Click "Clear History..."
    const openModalBtn = screen.getByRole("button", { name: /Open Clear Stored History dialog/i });
    await userEvent.click(openModalBtn);

    // Modal appears
    expect(screen.getByRole("heading", { name: /Clear All Stored History\?/i })).toBeInTheDocument();
    expect(screen.getByText(/This action will permanently delete:/i)).toBeInTheDocument();
    expect(screen.getByText(/Only files inside the FocusGuard user-data store will be purged/i)).toBeInTheDocument();

    // Confirm purge
    const confirmBtn = screen.getByRole("button", { name: /Yes, Purge History/i });
    await userEvent.click(confirmBtn);

    expect(clearSpy).toHaveBeenCalled();
    expect(await screen.findByText(/Successfully cleared 3 sessions and 2 intervention events/i)).toBeInTheDocument();
  });
});
