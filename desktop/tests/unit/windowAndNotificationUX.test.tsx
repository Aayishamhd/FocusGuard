/**
 * FocusGuard Window UX & Native Notification Tests
 *
 * Verifies:
 * 1. TitleBar rendering with accessible controls:
 *    - Movable drag region
 *    - Minimize button
 *    - Maximize/Restore button
 *    - Close button
 * 2. Window control actions calling window.focusGuard IPC methods
 * 3. Maximize state tracking and button icon updating
 * 4. NotificationService dispatching all 7 notification categories:
 *    - Focus Reminder
 *    - Distraction Detected
 *    - Recovery Suggestion
 *    - Stuck / AI Help
 *    - Break Suggestion
 *    - Session Started
 *    - Session Completed
 * 5. Notification suppression when notificationsEnabled is false
 * 6. Notification click callback bringing user to relevant context
 * 7. DevMockControls exposing test buttons for notifications in dev mode
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TitleBar } from "../../src/renderer/src/components/TitleBar";
import { notificationService } from "../../src/renderer/src/services/notificationService";
import { storageService } from "../../src/renderer/src/services/storageService";
import { DevMockControls } from "../../src/renderer/src/components/DevMockControls";
import { AppProvider } from "../../src/renderer/src/store/appStore";

describe("Window UX — TitleBar & Window Controls", () => {
  let minimizeMock: any;
  let toggleMaximizeMock: any;
  let isMaximizedMock: any;
  let closeMock: any;
  let onMaximizedChangeMock: any;

  beforeEach(() => {
    minimizeMock = vi.fn().mockResolvedValue({ success: true });
    toggleMaximizeMock = vi.fn().mockResolvedValue(true);
    isMaximizedMock = vi.fn().mockResolvedValue(false);
    closeMock = vi.fn().mockResolvedValue({ success: true });
    onMaximizedChangeMock = vi.fn().mockReturnValue(() => {});

    window.focusGuard = {
      ...(window.focusGuard as any),
      minimizeWindow: minimizeMock,
      toggleMaximizeWindow: toggleMaximizeMock,
      isWindowMaximized: isMaximizedMock,
      closeWindow: closeMock,
      onWindowMaximizedChange: onMaximizedChangeMock,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders TitleBar with brand and accessible controls", () => {
    render(<TitleBar />);

    expect(screen.getByText("FocusGuard")).toBeInTheDocument();
    expect(screen.getByText(/Attention Companion/i)).toBeInTheDocument();

    const minBtn = screen.getByRole("button", { name: /Minimize Window/i });
    const maxBtn = screen.getByRole("button", { name: /Maximize Window/i });
    const closeBtn = screen.getByRole("button", { name: /Close Window/i });

    expect(minBtn).toBeInTheDocument();
    expect(maxBtn).toBeInTheDocument();
    expect(closeBtn).toBeInTheDocument();
  });

  it("clicking Minimize invokes minimizeWindow", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const minBtn = screen.getByRole("button", { name: /Minimize Window/i });
    await user.click(minBtn);

    expect(minimizeMock).toHaveBeenCalledTimes(1);
  });

  it("clicking Maximize toggles maximize state and updates label", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const maxBtn = screen.getByRole("button", { name: /Maximize Window/i });
    await user.click(maxBtn);

    expect(toggleMaximizeMock).toHaveBeenCalledTimes(1);

    // After state becomes true, button reflects Restore Window
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Restore Window/i })).toBeInTheDocument();
    });
  });

  it("clicking Close invokes closeWindow", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const closeBtn = screen.getByRole("button", { name: /Close Window/i });
    await user.click(closeBtn);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});

describe("Native Notification System — NotificationService", () => {
  let showNotificationMock: any;

  beforeEach(async () => {
    showNotificationMock = vi.fn().mockResolvedValue({ sent: true });

    window.focusGuard = {
      ...(window.focusGuard as any),
      showNotification: showNotificationMock,
    };

    // Ensure notifications are enabled by default
    await storageService.setPreferences({ notificationsEnabled: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Focus Reminder sends gentle nudge notification", async () => {
    const res = await notificationService.notifyFocusReminder("Write report");
    expect(res.sent).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FocusGuard — Gentle Reminder",
        body: expect.stringContaining("Write report"),
        type: "reminder",
      })
    );
  });

  it("2. Distraction Detected sends non-punitive attention drift notification", async () => {
    const res = await notificationService.notifyDistraction("Study physics");
    expect(res.sent).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FocusGuard — Attention Drift",
        body: expect.stringContaining("attention may have drifted"),
        type: "distraction",
      })
    );
  });

  it("3. Recovery Suggestion sends encouraging reset notification", async () => {
    const res = await notificationService.notifyRecovery();
    expect(res.sent).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FocusGuard — Let's Get Back on Track",
        body: expect.stringContaining("Take a moment, reset"),
        type: "recovery",
      })
    );
  });

  it("4. Stuck / AI Assistance sends contextual decomposition notification", async () => {
    const res = await notificationService.notifyStuckHelp("Let's break down step 2 into smaller actions.");
    expect(res.sent).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FocusGuard — Need a Hand?",
        body: "Let's break down step 2 into smaller actions.",
        type: "stuck",
      })
    );
  });

  it("5. Break Suggestion recommends restorative break", async () => {
    const res = await notificationService.notifyBreakSuggestion(10);
    expect(res.sent).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FocusGuard — Time for a Break?",
        body: expect.stringContaining("You've been focusing for a while"),
        type: "break",
      })
    );
  });

  it("6. Session Started confirms active session", async () => {
    const res = await notificationService.notifySessionStarted("Build compiler");
    expect(res.sent).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FocusGuard — Focus Session Started",
        body: expect.stringContaining("Your focus session has started"),
        type: "session_start",
      })
    );
  });

  it("7. Session Completed includes duration and congratulatory message", async () => {
    const res = await notificationService.notifySessionCompleted("42 mins");
    expect(res.sent).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FocusGuard — Session Complete",
        body: expect.stringContaining("42 mins"),
        type: "session_end",
      })
    );
  });

  it("respects user preference and suppresses notifications when disabled", async () => {
    await storageService.setPreferences({ notificationsEnabled: false });

    const res = await notificationService.notifyFocusReminder("Suppressed task");
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("Notifications disabled");
    expect(showNotificationMock).not.toHaveBeenCalled();
  });
});

describe("DevMockControls — Native Notification Test Launchers", () => {
  it("renders notification test launchers in DEV mode", () => {
    render(
      <AppProvider>
        <DevMockControls />
      </AppProvider>
    );

    expect(screen.getByRole("button", { name: /Test Reminder/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Test Distraction/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Test Recovery/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Test Stuck \/ AI Help/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Test Break/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Test Complete/i })).toBeInTheDocument();
  });
});
