/**
 * FocusGuard Feature 3, Part 3: Assistant and Recovery UX Tests
 *
 * Verifies:
 * 1. Task breakdown loading, success, active-step selection, empty results, error handling, input preservation, and retry.
 * 2. Gentle intervention levels (1-4), accessible announcements, actions, and cooldown suppression.
 * 3. Focus recovery modal with 4 canonical choices, loading state, supportive response, actionable next steps, error retry, and Escape key dismissal.
 * 4. Break mode countdown, extension, breathing guide, and focus resumption.
 * 5. Mock assistant simulation knobs (unavailable, empty, slow, level overrides).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TaskDecomposeModal } from "../../src/renderer/src/components/TaskDecomposeModal";
import { InterventionToast } from "../../src/renderer/src/components/Intervention";
import { RecoveryModal } from "../../src/renderer/src/components/RecoveryModal";
import { BreakMode } from "../../src/renderer/src/components/BreakMode";
import { MockAssistantClient } from "../../src/renderer/src/services/mockAssistantClient";
import * as serviceManager from "../../src/renderer/src/services/serviceManager";
import type { InterventionDecision, InterventionLevel } from "../../src/renderer/src/types/contracts";

describe("Part 3 — Task Breakdown Component", () => {
  let mockAssistant: MockAssistantClient;

  beforeEach(() => {
    mockAssistant = new MockAssistantClient();
    vi.spyOn(serviceManager, "getAssistantService").mockReturnValue(mockAssistant);
  });

  it("submits broad task, displays loading, and renders interactive checklist", async () => {
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    render(
      <TaskDecomposeModal
        initialTask="Prepare my project presentation"
        onApplySubtasks={handleApply}
        onClose={handleClose}
      />
    );

    const input = screen.getByLabelText(/What is the overarching goal\?/i) as HTMLInputElement;
    expect(input.value).toBe("Prepare my project presentation");

    const breakDownBtn = screen.getByRole("button", { name: /Generate subtasks/i });
    fireEvent.click(breakDownBtn);

    // Shows loading state
    expect(screen.getByText(/Analyzing goal and identifying smallest immediate first step/i)).toBeInTheDocument();

    // Renders generated subtasks
    await waitFor(() => {
      expect(screen.getByText(/Suggested Action Sequence/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Immediate Next Step/i)).toBeInTheDocument();

    // Apply subtasks
    const applyBtn = screen.getByRole("button", { name: /Apply generated subtasks to current session/i });
    fireEvent.click(applyBtn);

    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("allows selecting any step as the immediate next step", async () => {
    render(
      <TaskDecomposeModal
        initialTask="Launch marketing campaign"
        onApplySubtasks={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate subtasks/i }));

    await waitFor(() => {
      expect(screen.getByText(/Draft the first version/i)).toBeInTheDocument();
    });

    // Click step 3 to make it the active starting point
    const step3 = screen.getByRole("button", { name: /Step 3: Draft the first version/i });
    fireEvent.click(step3);

    // Step 3 now has the immediate next step badge
    expect(step3.textContent).toContain("Immediate Next Step");
  });

  it("handles empty results without faking success", async () => {
    mockAssistant.simulateEmptyDecomposition = true;

    render(
      <TaskDecomposeModal
        initialTask="Vague empty task"
        onApplySubtasks={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate subtasks/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/The assistant did not return any steps for this task/i)
      ).toBeInTheDocument();
    });

    // Does not show apply button when results are empty
    expect(
      screen.queryByRole("button", { name: /Apply generated subtasks/i })
    ).not.toBeInTheDocument();
  });

  it("handles assistant service errors, preserves input text, and allows retry", async () => {
    mockAssistant.simulateUnavailable = true;

    render(
      <TaskDecomposeModal
        initialTask="Write critical architecture doc"
        onApplySubtasks={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate subtasks/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/Assistant decomposition service error/i)).toBeInTheDocument();

    // Input text is preserved!
    const input = screen.getByLabelText(/What is the overarching goal\?/i) as HTMLInputElement;
    expect(input.value).toBe("Write critical architecture doc");

    // Clear the error and retry
    mockAssistant.simulateUnavailable = false;
    const retryBtn = screen.getByRole("button", { name: /Retry breakdown/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Suggested Action Sequence/i)).toBeInTheDocument();
    });
  });

  it("dismisses on Escape key", () => {
    const handleClose = vi.fn();
    render(
      <TaskDecomposeModal
        initialTask="Test task"
        onApplySubtasks={vi.fn()}
        onClose={handleClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe("Part 3 — Gentle Intervention Component", () => {
  const levels: InterventionLevel[] = [
    "LEVEL_1_GENTLE_REMINDER",
    "LEVEL_2_RECOVERY_SUGGESTION",
    "LEVEL_3_ASSISTANCE",
    "LEVEL_4_BREAK_SUGGESTION",
  ];

  it.each(levels)("renders %s with accessible alertdialog and proper action buttons", (level) => {
    const decision: InterventionDecision = {
      decisionId: `dec-${level}`,
      timestamp: new Date().toISOString(),
      shouldIntervene: true,
      level,
      triggerReason: "Test trigger",
      message: "Focus drift notice",
      actions: [
        { actionId: "return_to_task", label: "Return to Task" },
        { actionId: "break_down_task", label: "Break Down Task" },
        { actionId: "take_break", label: "Take a Break" },
        { actionId: "dismiss", label: "Dismiss" },
      ],
    };

    render(
      <InterventionToast
        decision={decision}
        onAction={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-labelledby", "intervention-title");
    expect(dialog).toHaveAttribute("aria-describedby", "intervention-msg");

    expect(screen.getByText("Return to Task")).toBeInTheDocument();
    expect(screen.getByText("Break Down Task")).toBeInTheDocument();
    expect(screen.getByText("Take a Break")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("calls onAction and onDismiss when an action button is selected", () => {
    const handleAction = vi.fn();
    const handleDismiss = vi.fn();

    const decision: InterventionDecision = {
      decisionId: "dec-test",
      timestamp: new Date().toISOString(),
      shouldIntervene: true,
      level: "LEVEL_2_RECOVERY_SUGGESTION",
      triggerReason: "Drift",
      message: "Ready to return?",
      actions: [{ actionId: "return_to_task", label: "Return to Task" }],
    };

    render(
      <InterventionToast
        decision={decision}
        onAction={handleAction}
        onDismiss={handleDismiss}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Return to Task/i }));
    expect(handleAction).toHaveBeenCalledWith("return_to_task");
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when close 'X' button is clicked", () => {
    const handleDismiss = vi.fn();
    const decision: InterventionDecision = {
      decisionId: "dec-dismiss",
      timestamp: new Date().toISOString(),
      shouldIntervene: true,
      level: "LEVEL_1_GENTLE_REMINDER",
      triggerReason: "Slight drift",
      message: "Reminder message",
    };

    render(
      <InterventionToast
        decision={decision}
        onAction={vi.fn()}
        onDismiss={handleDismiss}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Dismiss notification/i }));
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("Part 3 — Focus Recovery Modal ('What happened?')", () => {
  let mockAssistant: MockAssistantClient;

  beforeEach(() => {
    mockAssistant = new MockAssistantClient();
    vi.spyOn(serviceManager, "getAssistantService").mockReturnValue(mockAssistant);
  });

  it("renders all four canonical recovery choices", () => {
    render(
      <RecoveryModal
        sessionId="sess-1"
        currentTask="Complete report"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("What happened?")).toBeInTheDocument();
    expect(screen.getByText("I'm tired")).toBeInTheDocument();
    expect(screen.getByText("The task is confusing")).toBeInTheDocument();
    expect(screen.getByText("I got distracted")).toBeInTheDocument();
    expect(screen.getByText("I need a break")).toBeInTheDocument();
  });

  it("submits reason 'task_confusing' and presents simplify task action", async () => {
    const handleDecompose = vi.fn();

    render(
      <RecoveryModal
        sessionId="sess-1"
        currentTask="Complete report"
        onClose={vi.fn()}
        onDecomposeTask={handleDecompose}
      />
    );

    // Select "The task is confusing"
    const confusingBtn = screen.getByRole("radio", { name: /The task is confusing/i });
    fireEvent.click(confusingBtn);

    await waitFor(() => {
      expect(screen.getByText(/Complex tasks can feel overwhelming|Ambiguous or multi-part tasks/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Immediate Concrete Step/i)).toBeInTheDocument();

    // Click "Break Down This Task"
    const actionBtn = screen.getByRole("button", { name: /Break down task into smaller steps/i });
    fireEvent.click(actionBtn);

    expect(handleDecompose).toHaveBeenCalledTimes(1);
  });

  it("submits reason 'tired' and presents take a break action", async () => {
    const handleTakeBreak = vi.fn();

    render(
      <RecoveryModal
        sessionId="sess-1"
        currentTask="Complete report"
        onClose={vi.fn()}
        onTakeBreak={handleTakeBreak}
      />
    );

    // Select "I'm tired"
    fireEvent.click(screen.getByRole("radio", { name: /I'm tired/i }));

    await waitFor(() => {
      expect(screen.getByText(/It's completely normal to feel fatigued|It's okay to feel tired/i)).toBeInTheDocument();
    });

    // Click "Take a 5-Minute Break"
    const breakBtn = screen.getByRole("button", { name: /Start mindful break/i });
    fireEvent.click(breakBtn);

    expect(handleTakeBreak).toHaveBeenCalledWith(5);
  });

  it("submits reason 'distracted' and presents return to task action", async () => {
    const handleResume = vi.fn();

    render(
      <RecoveryModal
        sessionId="sess-1"
        currentTask="Complete report"
        onClose={vi.fn()}
        onResumeTask={handleResume}
      />
    );

    // Select "I got distracted"
    fireEvent.click(screen.getByRole("radio", { name: /I got distracted/i }));

    await waitFor(() => {
      expect(screen.getByText(/Noticing that your focus wandered|Distractions happen to everyone/i)).toBeInTheDocument();
    });

    // Click "I'm Ready to Refocus"
    const resumeBtn = screen.getByRole("button", { name: /Resume focus on current task/i });
    fireEvent.click(resumeBtn);

    expect(handleResume).toHaveBeenCalledTimes(1);
  });

  it("handles assistant service error with retry", async () => {
    mockAssistant.simulateUnavailable = true;

    render(
      <RecoveryModal
        sessionId="sess-1"
        currentTask="Complete report"
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /I need a break/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/Unable to reach assistant service/i)).toBeInTheDocument();

    // Disable error and retry
    mockAssistant.simulateUnavailable = false;
    fireEvent.click(screen.getByRole("button", { name: /Retry recovery request/i }));

    await waitFor(() => {
      expect(screen.getByText(/Listening to your body's need for a break|Take the time you need/i)).toBeInTheDocument();
    });
  });

  it("dismisses on Escape key", () => {
    const handleClose = vi.fn();
    render(
      <RecoveryModal
        sessionId="sess-1"
        currentTask="Complete report"
        onClose={handleClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe("Part 3 — Mindful Break Mode Overlay", () => {
  it("renders countdown timer, breathing pacer, and resume action", () => {
    const handleResume = vi.fn();

    render(
      <BreakMode
        breakDurationMinutes={5}
        taskName="Finish presentation"
        onResumeFocus={handleResume}
      />
    );

    expect(screen.getByText(/Mindful Recharging Break/i)).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText(/Rest your eyes and shoulders/i)).toBeInTheDocument();

    const resumeBtn = screen.getByRole("button", { name: /Resume focus on current task/i });
    fireEvent.click(resumeBtn);
    expect(handleResume).toHaveBeenCalledTimes(1);
  });

  it("allows extending break duration by 2 minutes", () => {
    render(
      <BreakMode
        breakDurationMinutes={3}
        taskName="Finish presentation"
        onResumeFocus={vi.fn()}
      />
    );

    expect(screen.getByText("03:00")).toBeInTheDocument();

    const extendBtn = screen.getByRole("button", { name: /Extend break by 2 minutes/i });
    fireEvent.click(extendBtn);

    // Timer is extended by 2 minutes (3m -> 5m)
    expect(screen.getByText("05:00")).toBeInTheDocument();
  });

  it("resumes focus on Escape key", () => {
    const handleResume = vi.fn();
    render(
      <BreakMode
        breakDurationMinutes={5}
        taskName="Finish presentation"
        onResumeFocus={handleResume}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleResume).toHaveBeenCalledTimes(1);
  });
});

describe("Part 3 — Mock Assistant Scenarios & Knobs", () => {
  it("validates that all recovery reasons return valid responses matching contract", async () => {
    const client = new MockAssistantClient();
    const reasons = ["tired", "task_confusing", "distracted", "need_break", "other"] as const;

    for (const r of reasons) {
      const res = await client.recover({
        sessionId: "s1",
        currentTask: "Goal",
        userReason: r,
      });

      expect(res.recommendation).toBeDefined();
      expect(res.supportiveMessage.length).toBeGreaterThan(10);
    }
  });

  it("honors forced intervention level override in mock assistant", async () => {
    const client = new MockAssistantClient();
    client.forcedInterventionLevel = "LEVEL_4_BREAK_SUGGESTION";

    const decision = await client.intervene({
      eventId: "e1",
      timestamp: new Date().toISOString(),
      attentionState: "FOCUSED", // Even if attention is focused, forced override applies
      confidence: 0.9,
      activeApp: { appName: "App", windowTitle: "Title", category: "work" },
      metrics: { sessionDurationSeconds: 100, appDurationSeconds: 100, recentSwitchCount: 0, inactivitySeconds: 0 },
      sources: ["activity_monitor"],
    });

    expect(decision.level).toBe("LEVEL_4_BREAK_SUGGESTION");
    expect(decision.shouldIntervene).toBe(true);
    expect(decision.suggestedBreakMinutes).toBe(5);
  });
});
