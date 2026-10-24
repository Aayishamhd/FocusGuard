/**
 * Mock Assistant Client — deterministic, contract-shaped AI responses for offline dev.
 * Implements IAssistantClient. All responses match SHARED_CONTRACTS.md schemas exactly.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  AttentionEvent,
  AssistantHealthResponse,
  InterventionDecision,
  InterventionLevel,
  TaskDecompositionRequest,
  TaskDecompositionResponse,
  RecoveryFeedbackRequest,
  RecoveryFeedbackResponse,
} from "../types/contracts";
import type { IAssistantClient } from "./assistantClient";

// ─── Helper ───────────────────────────────────────────────────────────────

function simulatedDelay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Intervention Scenarios ───────────────────────────────────────────────

interface InterventionScenario {
  level: InterventionLevel;
  triggerReason: string;
  message: string;
}

const INTERVENTION_SCENARIOS: Record<string, InterventionScenario> = {
  FOCUSED: {
    level: "LEVEL_0_NONE",
    triggerReason: "User is maintaining stable focus",
    message: "",
  },
  POSSIBLY_DRIFTING: {
    level: "LEVEL_1_GENTLE_REMINDER",
    triggerReason: "Attention may have shifted slightly",
    message: "Looks like your attention may have shifted. Still working on your goal?",
  },
  DISTRACTED: {
    level: "LEVEL_2_RECOVERY_SUGGESTION",
    triggerReason: "Detected frequent context switching to non-work apps",
    message: "Focus drifted to a leisure app. Ready to jump back to what you were working on?",
  },
  RECOVERING: {
    level: "LEVEL_1_GENTLE_REMINDER",
    triggerReason: "User is returning to task after distraction",
    message: "Welcome back! You were making great progress.",
  },
  IDLE: {
    level: "LEVEL_4_BREAK_SUGGESTION",
    triggerReason: "Extended inactivity or prolonged focus detected",
    message: "You have been working for a while. Would a short break help you recharge?",
  },
};

const LEVEL_PRESETS: Record<InterventionLevel, InterventionScenario> = {
  LEVEL_0_NONE: {
    level: "LEVEL_0_NONE",
    triggerReason: "No intervention needed",
    message: "",
  },
  LEVEL_1_GENTLE_REMINDER: {
    level: "LEVEL_1_GENTLE_REMINDER",
    triggerReason: "Mild drift detected",
    message: "Gentle nudge: Are you still working toward your focus goal?",
  },
  LEVEL_2_RECOVERY_SUGGESTION: {
    level: "LEVEL_2_RECOVERY_SUGGESTION",
    triggerReason: "Frequent context switching",
    message: "Focus drifted over to another window. Would you like to return to your last step?",
  },
  LEVEL_3_ASSISTANCE: {
    level: "LEVEL_3_ASSISTANCE",
    triggerReason: "User hesitating or stuck on complex task",
    message: "This task seems heavy. Would you like to break it into small, manageable steps?",
  },
  LEVEL_4_BREAK_SUGGESTION: {
    level: "LEVEL_4_BREAK_SUGGESTION",
    triggerReason: "High continuous focus duration reached",
    message: "You've been in deep focus for a while. A 5-minute break could help you recharge.",
  },
};

// ─── Mock Task Scenarios ──────────────────────────────────────────────────

const MOCK_SUBTASK_TEMPLATES: TaskDecompositionResponse["subtasks"] = [
  {
    stepNumber: 1,
    title: "Define the scope and goals",
    description: "Write 2-3 bullet points outlining what success looks like for this task.",
    estimatedMinutes: 5,
    isImmediateNextStep: true,
  },
  {
    stepNumber: 2,
    title: "Gather required resources",
    description: "List the tools, documents, or references you need to proceed.",
    estimatedMinutes: 10,
    isImmediateNextStep: false,
  },
  {
    stepNumber: 3,
    title: "Draft the first version",
    description: "Create a rough first pass — do not aim for perfection yet.",
    estimatedMinutes: 20,
    isImmediateNextStep: false,
  },
  {
    stepNumber: 4,
    title: "Review and refine",
    description: "Check for gaps, polish, and make final adjustments.",
    estimatedMinutes: 15,
    isImmediateNextStep: false,
  },
];

// ─── Mock Assistant Client ────────────────────────────────────────────────

export class MockAssistantClient implements IAssistantClient {
  public simulateUnavailable = false;
  public simulateEmptyDecomposition = false;
  public responseDelayMs = 0;
  public forcedInterventionLevel: InterventionLevel | null = null;

  async getHealth(): Promise<AssistantHealthResponse> {
    if (this.responseDelayMs > 0) await simulatedDelay(this.responseDelayMs);
    if (this.simulateUnavailable) {
      throw new Error("Assistant service unavailable (simulated 503)");
    }
    await simulatedDelay(100);
    return {
      status: "ok",
      llmConnected: true,
      model: "mock-heuristic-v1",
      fallbackMode: false,
    };
  }

  async intervene(event: AttentionEvent): Promise<InterventionDecision> {
    if (this.responseDelayMs > 0) await simulatedDelay(this.responseDelayMs);
    if (this.simulateUnavailable) {
      throw new Error("Assistant service unavailable (simulated 503)");
    }
    await simulatedDelay(200);

    const scenario = this.forcedInterventionLevel
      ? LEVEL_PRESETS[this.forcedInterventionLevel]
      : (INTERVENTION_SCENARIOS[event.attentionState] ??
        INTERVENTION_SCENARIOS["POSSIBLY_DRIFTING"]);

    const shouldIntervene = scenario.level !== "LEVEL_0_NONE";

    const decision: InterventionDecision = {
      decisionId: `mock-dec-${uuidv4().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      shouldIntervene,
      level: scenario.level,
      triggerReason: scenario.triggerReason,
    };

    if (shouldIntervene && scenario.message) {
      decision.message = scenario.message;
      decision.actions = [
        { actionId: "return_to_task", label: "Return to Task" },
        { actionId: "break_down_task", label: "Break Down Task" },
        { actionId: "take_break", label: "Take a Break" },
        { actionId: "dismiss", label: "Dismiss" },
      ];
    }

    if (scenario.level === "LEVEL_4_BREAK_SUGGESTION") {
      decision.suggestedBreakMinutes = 5;
    }

    return decision;
  }

  async decompose(
    request: TaskDecompositionRequest
  ): Promise<TaskDecompositionResponse> {
    if (this.responseDelayMs > 0) await simulatedDelay(this.responseDelayMs);
    if (this.simulateUnavailable) {
      throw new Error("Assistant decomposition service error (simulated)");
    }
    await simulatedDelay(350);

    if (this.simulateEmptyDecomposition) {
      return {
        originalTask: request.taskDescription,
        subtasks: [],
      };
    }

    const subtaskCount = request.difficultyLevel === "quick" ? 2 : 4;
    const subtasks = MOCK_SUBTASK_TEMPLATES.slice(0, subtaskCount).map((s, i) => ({
      ...s,
      title:
        i === 0
          ? `Step 1: ${request.taskDescription.slice(0, 45)}`
          : s.title,
    }));

    return {
      originalTask: request.taskDescription,
      subtasks,
    };
  }

  async recover(request: RecoveryFeedbackRequest): Promise<RecoveryFeedbackResponse> {
    if (this.responseDelayMs > 0) await simulatedDelay(this.responseDelayMs);
    if (this.simulateUnavailable) {
      throw new Error("Assistant recovery service error (simulated)");
    }
    await simulatedDelay(250);

    const responses: Record<RecoveryFeedbackRequest["userReason"], RecoveryFeedbackResponse> = {
      tired: {
        recommendation: "take_break",
        supportiveMessage:
          "It's completely normal to feel fatigued. A brief 5-minute break often restores more mental clarity than forcing attention.",
        actionPayload: {
          suggestedBreakMinutes: 5,
          suggestedNextAction: "Step away, stretch your shoulders, and drink a glass of water.",
        },
      },
      task_confusing: {
        recommendation: "simplify_task",
        supportiveMessage:
          "Ambiguous or multi-part tasks naturally trigger avoidance. Let's break this into a clear, single first step.",
        actionPayload: {
          suggestedNextAction: "Write just one sentence describing the very first deliverable.",
        },
      },
      distracted: {
        recommendation: "resume_previous",
        supportiveMessage:
          "Noticing that your focus wandered is the most important step in attention recovery. No judgment — let's re-anchor.",
        actionPayload: {
          suggestedNextAction: `Open your workspace and complete the immediate next step for: ${request.currentTask}`,
        },
      },
      need_break: {
        recommendation: "take_break",
        supportiveMessage:
          "Listening to your body's need for a break sustains long-term productivity. Take intentional time to recharge.",
        actionPayload: {
          suggestedBreakMinutes: 5,
        },
      },
      other: {
        recommendation: "custom_tip",
        supportiveMessage:
          "Whatever is pulling your attention, remember that progress happens one small action at a time.",
        actionPayload: {
          suggestedNextAction: "Identify the smallest 2-minute step to resume momentum.",
        },
      },
    };

    return responses[request.userReason] ?? responses.other;
  }
}
