/**
 * FocusGuard Dashboard Components — React UI & Accessibility Tests
 *
 * Verifies Part 2 component requirements:
 * 1. Accessible AttentionBadge rendering for canonical states without color-only signaling.
 * 2. DashboardHeader greeting, date, monitoring states, and settings shortcut.
 * 3. EndSessionModal accessibility, keyboard escape dismissal, and action dispatch.
 * 4. SubtaskList progress calculation, checkbox toggling, and active step selection.
 * 5. SessionSummaryCard metric formatting and new session action.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttentionBadge } from "../../src/renderer/src/components/AttentionBadge";
import { DashboardHeader } from "../../src/renderer/src/components/DashboardHeader";
import { EndSessionModal } from "../../src/renderer/src/components/EndSessionModal";
import { SubtaskList } from "../../src/renderer/src/components/SubtaskList";
import { SessionSummaryCard } from "../../src/renderer/src/components/SessionSummaryCard";
import type { FocusSession, SubTaskItem } from "../../src/renderer/src/types/app";
import type { AttentionState } from "../../src/renderer/src/types/contracts";

describe("UI Component — AttentionBadge", () => {
  const canonicalStates: AttentionState[] = [
    "FOCUSED",
    "POSSIBLY_DRIFTING",
    "DISTRACTED",
    "RECOVERING",
    "IDLE",
  ];

  it.each(canonicalStates)("renders status '%s' with accessible label and icon", (state) => {
    render(<AttentionBadge state={state} confidence={0.85} />);
    const statusEl = screen.getByRole("status");
    expect(statusEl).toBeInTheDocument();
    expect(statusEl).toHaveAttribute("aria-label");
    // Text label is visible, not color alone
    expect(statusEl.textContent).toContain("85%");
  });

  it("renders non-punitive description when showDescription is true", () => {
    render(<AttentionBadge state="DISTRACTED" showDescription={true} />);
    expect(
      screen.getByText(/Extended off-task or non-productive window activity detected/i)
    ).toBeInTheDocument();
  });
});

describe("UI Component — DashboardHeader", () => {
  it("renders greeting, date, and active monitoring pill when running", () => {
    render(
      <DashboardHeader
        sessionStatus="running"
        engineConnected={true}
        onOpenSettings={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Monitoring Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Running/i)).toBeInTheDocument();
  });

  it("renders paused monitoring pill when session is paused", () => {
    render(
      <DashboardHeader
        sessionStatus="paused"
        engineConnected={true}
        onOpenSettings={vi.fn()}
      />
    );

    expect(screen.getByText("Monitoring Paused")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("triggers onOpenSettings when settings button is clicked", () => {
    const handleSettings = vi.fn();
    render(
      <DashboardHeader
        sessionStatus="idle"
        engineConnected={false}
        onOpenSettings={handleSettings}
      />
    );

    const btn = screen.getByRole("button", { name: /Open FocusGuard Settings/i });
    fireEvent.click(btn);
    expect(handleSettings).toHaveBeenCalledTimes(1);
  });
});

describe("UI Component — EndSessionModal", () => {
  it("renders confirmation dialog with accessible role and labels", () => {
    render(
      <EndSessionModal
        taskName="Refactor Timer"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-labelledby", "end-session-modal-title");
    expect(screen.getByText(/End Focus Session\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Refactor Timer/i)).toBeInTheDocument();
  });

  it("calls onConfirm when 'End Session' is clicked", () => {
    const handleConfirm = vi.fn();
    render(
      <EndSessionModal
        taskName="Test Task"
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: /Confirm and end current session/i });
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when 'Keep Working' is clicked", () => {
    const handleCancel = vi.fn();
    render(
      <EndSessionModal
        taskName="Test Task"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: /Keep working, do not end session/i });
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape key press", () => {
    const handleCancel = vi.fn();
    render(
      <EndSessionModal
        taskName="Test Task"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});

describe("UI Component — SubtaskList", () => {
  const sampleSubtasks: SubTaskItem[] = [
    {
      id: "st-1",
      stepNumber: 1,
      title: "Write documentation",
      description: "Outline API endpoints",
      estimatedMinutes: 15,
      completed: true,
      isImmediateNextStep: false,
    },
    {
      id: "st-2",
      stepNumber: 2,
      title: "Run unit tests",
      description: "Verify all test cases pass",
      estimatedMinutes: 10,
      completed: false,
      isImmediateNextStep: true,
    },
  ];

  it("renders empty state with breakdown button when no subtasks exist", () => {
    const handleBreakdown = vi.fn();
    render(
      <SubtaskList
        subtasks={[]}
        activeSubtaskId={null}
        onToggle={vi.fn()}
        onSelectActive={vi.fn()}
        onRequestBreakdown={handleBreakdown}
      />
    );

    expect(screen.getByText(/No subtasks yet/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Generate AI subtasks/i });
    fireEvent.click(btn);
    expect(handleBreakdown).toHaveBeenCalledTimes(1);
  });

  it("renders subtask items with progress calculation", () => {
    render(
      <SubtaskList
        subtasks={sampleSubtasks}
        activeSubtaskId="st-2"
        onToggle={vi.fn()}
        onSelectActive={vi.fn()}
      />
    );

    expect(screen.getByText(/1 of 2 completed \(50%\)/i)).toBeInTheDocument();
    expect(screen.getByText("Write documentation")).toBeInTheDocument();
    expect(screen.getByText("Run unit tests")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("triggers onToggle when checkbox is clicked", () => {
    const handleToggle = vi.fn();
    render(
      <SubtaskList
        subtasks={sampleSubtasks}
        activeSubtaskId="st-2"
        onToggle={handleToggle}
        onSelectActive={vi.fn()}
      />
    );

    const checkBtn = screen.getByRole("button", {
      name: /Mark step 2: Run unit tests as completed/i,
    });
    fireEvent.click(checkBtn);
    expect(handleToggle).toHaveBeenCalledWith("st-2");
  });

  it("triggers onSelectActive when clicking item body", () => {
    const handleSelect = vi.fn();
    render(
      <SubtaskList
        subtasks={sampleSubtasks}
        activeSubtaskId="st-1"
        onToggle={vi.fn()}
        onSelectActive={handleSelect}
      />
    );

    const bodyEl = screen.getByRole("button", {
      name: /^Step 2: Run unit tests/i,
    });
    fireEvent.click(bodyEl);
    expect(handleSelect).toHaveBeenCalledWith("st-2");
  });
});

describe("UI Component — SessionSummaryCard", () => {
  const sampleSession: FocusSession = {
    id: "sess-completed-1",
    task: "Implement Dashboard Part 2",
    startTime: "2026-10-24T10:00:00.000Z",
    endTime: "2026-10-24T10:45:30.000Z",
    startedAt: 1700000000000,
    pausedAt: null,
    totalPausedMs: 120000, // 2 mins paused
    totalFocusSeconds: 2610, // 43m 30s
    pauseCount: 2,
    recoveryCount: 1,
    status: "completed",
    subtasks: [
      { id: "s1", stepNumber: 1, title: "Step 1", description: "", estimatedMinutes: 10, completed: true, isImmediateNextStep: false },
      { id: "s2", stepNumber: 2, title: "Step 2", description: "", estimatedMinutes: 15, completed: true, isImmediateNextStep: false },
    ],
    activeSubtaskId: null,
  };

  it("renders session task title and formatted metrics", () => {
    render(<SessionSummaryCard session={sampleSession} onStartNewSession={vi.fn()} />);

    expect(screen.getByText("Implement Dashboard Part 2")).toBeInTheDocument();
    expect(screen.getByText(/43m 30s/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 pauses
    expect(screen.getByText("1")).toBeInTheDocument(); // 1 recovery
    expect(screen.getByText("2/2")).toBeInTheDocument(); // 2/2 steps done
  });

  it("triggers onStartNewSession when 'Start New Focus Session' is clicked", () => {
    const handleNew = vi.fn();
    render(<SessionSummaryCard session={sampleSession} onStartNewSession={handleNew} />);

    const btn = screen.getByRole("button", { name: /Start a new focus session/i });
    fireEvent.click(btn);
    expect(handleNew).toHaveBeenCalledTimes(1);
  });
});
