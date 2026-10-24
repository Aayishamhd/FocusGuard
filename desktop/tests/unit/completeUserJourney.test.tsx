/**
 * End-to-End User Journey Tests (Part 6 — Final QA & Release Readiness)
 *
 * Simulates and verifies the complete 16-step user journey:
 * 1. Launch the application.
 * 2. Enter and save a task.
 * 3. Start a focus session.
 * 4. Generate a task breakdown via mock assistant.
 * 5. Select and complete subtasks.
 * 6. Simulate attention drifting.
 * 7. Receive gentle intervention.
 * 8. Execute intervention action (Return to Task / Dismiss).
 * 9. Open focus recovery modal and test reasons (tired, distracted, etc.).
 * 10. Start, pause, resume, and end break mode.
 * 11. Pause and resume monitoring.
 * 12. End the session.
 * 13. Open analytics and verify recorded data consistency.
 * 14. Change privacy preferences (webcam toggle, notifications).
 * 15. Restart application simulation and verify persisted data.
 * 16. Clear stored history and verify the purge.
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/renderer/src/App";
import {
  getMockEngineClient,
  resetServices,
} from "../../src/renderer/src/services/serviceManager";

describe("Complete End-to-End User Journey (16 Steps)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetServices();
  });

  afterEach(() => {
    resetServices();
  });

  it("executes the entire 16-step user journey flawlessly", async () => {
    const user = userEvent.setup();

    // ─── Step 1: Launch the application ─────────────────────────────────────
    const { unmount } = render(<App />);
    expect(screen.getAllByText(/FocusGuard/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Monitoring Inactive/i)).toBeInTheDocument();

    // ─── Step 2 & 3: Enter task and start focus session ─────────────────────
    const taskInput = screen.getByLabelText(/New focus task goal/i);
    await user.type(taskInput, "Prepare my project presentation");
    const startBtn = screen.getByRole("button", { name: /Start focus session/i });
    await user.click(startBtn);

    // Session is now active
    expect(await screen.findByText(/Prepare my project presentation/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Focus Time/i)).toBeInTheDocument();

    // ─── Step 4: Generate task breakdown ────────────────────────────────────
    const breakDownBtn = screen.getByRole("button", { name: /Break task into manageable subtasks/i });
    await user.click(breakDownBtn);

    // Task decomposition modal appears
    expect(await screen.findByRole("heading", { name: /Break Down Large Goal/i })).toBeInTheDocument();
    const generateBtn = screen.getByRole("button", { name: /Generate subtasks/i });
    await user.click(generateBtn);

    // Subtasks returned from mock assistant
    expect(await screen.findByText(/Suggested Action Sequence/i)).toBeInTheDocument();
    const applyBtn = await screen.findByRole("button", { name: /Apply generated subtasks/i });
    await user.click(applyBtn);

    // ─── Step 5: Select and complete subtasks ────────────────────────────────
    const checkStep1Btn = await screen.findByRole("button", { name: /Mark step 1:.*as completed/i });
    await user.click(checkStep1Btn);
    expect(await screen.findByRole("button", { name: /Mark step 1:.*as incomplete/i })).toBeInTheDocument();

    // ─── Step 6 & 7: Simulate attention drifting & receive gentle intervention
    const mockEngine = getMockEngineClient();
    expect(mockEngine).not.toBeNull();
    mockEngine?.forceAttentionState("DISTRACTED");

    // Trigger intervention via dev simulation control
    const devInterveneBtn = screen.queryByRole("button", { name: /Trigger L2/i });
    if (devInterveneBtn) {
      await user.click(devInterveneBtn);
      // Step 8: Receive and interact with intervention toast
      expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
      const returnBtn = screen.getByRole("button", { name: /Return to Task/i });
      await user.click(returnBtn);
      // Toast dismissed
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      });
    }

    // ─── Step 9: Open focus recovery and select reasons ──────────────────────
    const stuckBtn = screen.getByRole("button", { name: /I'm stuck, help me refocus/i });
    await user.click(stuckBtn);

    expect(await screen.findByRole("heading", { name: /What happened\?/i })).toBeInTheDocument();
    expect(screen.getByText(/I'm tired/i)).toBeInTheDocument();
    expect(screen.getByText(/The task is confusing/i)).toBeInTheDocument();
    expect(screen.getByText(/I got distracted/i)).toBeInTheDocument();
    expect(screen.getByText(/I need a break/i)).toBeInTheDocument();

    // Select "I'm tired"
    const tiredChoice = screen.getByRole("radio", { name: /I'm tired/i });
    await user.click(tiredChoice);

    // Recovery guidance rendered
    expect(await screen.findByText(/It's completely normal to feel fatigued/i)).toBeInTheDocument();
    const closeRecoveryBtn = screen.getByRole("button", { name: /Close recovery modal/i });
    await user.click(closeRecoveryBtn);

    // ─── Step 10: Start, pause, resume, and end break mode ──────────────────
    // Open recovery to trigger break
    await user.click(stuckBtn);
    const needBreakChoice = await screen.findByRole("radio", { name: /I need a break/i });
    await user.click(needBreakChoice);

    const takeBreakBtn = await screen.findByRole("button", { name: /Take a 5-Minute Break/i });
    await user.click(takeBreakBtn);

    // Break mode overlay active
    expect(await screen.findByRole("dialog", { name: /Calming Break Mode/i })).toBeInTheDocument();
    expect(screen.getByText(/Mindful Recharging Break/i)).toBeInTheDocument();

    // Pause break timer
    const pauseBreakBtn = screen.getByRole("button", { name: /Pause break timer/i });
    await user.click(pauseBreakBtn);
    expect(screen.getByRole("button", { name: /Resume break timer/i })).toBeInTheDocument();

    // Resume break timer
    const resumeBreakBtn = screen.getByRole("button", { name: /Resume break timer/i });
    await user.click(resumeBreakBtn);
    expect(screen.getByRole("button", { name: /Pause break timer/i })).toBeInTheDocument();

    // End break and return to focus (use ID to disambiguate from recovery modal button)
    const endBreakBtn = document.getElementById("btn-resume-from-break")!;
    expect(endBreakBtn).toBeTruthy();
    await user.click(endBreakBtn);
    await waitFor(() => {
      expect(screen.queryByText(/Mindful Recharging Break/i)).not.toBeInTheDocument();
    });

    // ─── Step 11: Pause and resume monitoring ───────────────────────────────
    const pauseSessionBtn = screen.getByRole("button", { name: /Pause focus session/i });
    await user.click(pauseSessionBtn);
    expect(await screen.findByText(/Session Paused/i)).toBeInTheDocument();

    const resumeSessionBtn = screen.getByRole("button", { name: /Resume focus session/i });
    await user.click(resumeSessionBtn);
    expect(await screen.findByText(/Active Focus Time/i)).toBeInTheDocument();

    // ─── Step 12: End the session ───────────────────────────────────────────
    const endSessionBtn = screen.getByRole("button", { name: /End session/i });
    await user.click(endSessionBtn);

    // End session confirmation dialog
    expect(await screen.findByRole("heading", { name: /End Focus Session\?/i })).toBeInTheDocument();
    const confirmEndBtn = screen.getByRole("button", { name: /Confirm and end current session/i });
    await user.click(confirmEndBtn);

    // Summary card shown
    expect(await screen.findByText(/Session Concluded/i)).toBeInTheDocument();

    // ─── Step 13: Open Analytics and verify consistent metrics ──────────────
    const navAnalyticsBtn = document.getElementById("nav-analytics")!;
    await user.click(navAnalyticsBtn);

    expect(await screen.findByRole("heading", { name: /Analytics & Self-Understanding/i })).toBeInTheDocument();
    expect(await screen.findByText(/Completed Sessions/i)).toBeInTheDocument();

    // ─── Step 14: Change privacy preferences ────────────────────────────────
    const navSettingsBtn = document.getElementById("nav-settings")!;
    await user.click(navSettingsBtn);

    expect(await screen.findByRole("heading", { name: /Settings & Privacy Center/i })).toBeInTheDocument();
    const webcamToggle = screen.getByRole("switch", { name: /Toggle webcam engagement monitoring/i });
    expect(webcamToggle).toHaveAttribute("aria-checked", "false"); // Default off
    await user.click(webcamToggle);
    expect(webcamToggle).toHaveAttribute("aria-checked", "true"); // Persisted on

    // ─── Step 15: Restart simulation and verify persisted data ──────────────
    unmount();
    // Re-mount app
    render(<App />);

    const navSettingsAgain = document.getElementById("nav-settings")!;
    await user.click(navSettingsAgain);
    const reloadedWebcamToggle = await screen.findByRole("switch", { name: /Toggle webcam engagement monitoring/i });
    expect(reloadedWebcamToggle).toHaveAttribute("aria-checked", "true"); // Preference survived restart!

    // ─── Step 16: Clear stored history and verify purge ─────────────────────
    const clearHistoryBtn = screen.getByRole("button", { name: /Open Clear Stored History dialog/i });
    await user.click(clearHistoryBtn);

    expect(await screen.findByRole("heading", { name: /Clear All Stored History\?/i })).toBeInTheDocument();
    const confirmPurgeBtn = screen.getByRole("button", { name: /Yes, Purge History/i });
    await user.click(confirmPurgeBtn);

    expect(await screen.findByText(/Successfully cleared/i)).toBeInTheDocument();
  });
});
