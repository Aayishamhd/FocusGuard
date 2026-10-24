/**
 * FocusGuard Shared Data Contracts — TypeScript Types
 * Source: docs/SHARED_CONTRACTS.md (Version 1.0.0 FROZEN)
 * Do NOT rename or remove existing required fields.
 */

// ─── 2.1 Attention State ───────────────────────────────────────────────────

export type AttentionState =
  | "FOCUSED"
  | "POSSIBLY_DRIFTING"
  | "DISTRACTED"
  | "RECOVERING"
  | "IDLE";

// ─── 2.2 AttentionEvent (Feature 1 → Feature 2 & 3) ──────────────────────

export interface AttentionEvent {
  eventId: string;               // UUIDv4
  timestamp: string;             // ISO 8601
  attentionState: AttentionState;
  confidence: number;            // 0.0 to 1.0
  activeApp: {
    appName: string;
    windowTitle: string;
    category: "work" | "communication" | "entertainment" | "utility" | "unknown";
  };
  metrics: {
    sessionDurationSeconds: number;
    appDurationSeconds: number;
    recentSwitchCount: number;
    inactivitySeconds: number;
    webcamEngaged?: boolean;
  };
  sources: Array<"window_tracker" | "activity_monitor" | "webcam_headpose">;
}

// ─── 2.3 Intervention Decision (Feature 2 → Feature 3) ───────────────────

export type InterventionLevel =
  | "LEVEL_0_NONE"
  | "LEVEL_1_GENTLE_REMINDER"
  | "LEVEL_2_RECOVERY_SUGGESTION"
  | "LEVEL_3_ASSISTANCE"
  | "LEVEL_4_BREAK_SUGGESTION";

export interface InterventionAction {
  actionId: "return_to_task" | "break_down_task" | "take_break" | "dismiss";
  label: string;
}

export interface InterventionDecision {
  decisionId: string;            // UUIDv4
  timestamp: string;             // ISO 8601
  shouldIntervene: boolean;
  level: InterventionLevel;
  triggerReason: string;
  message?: string;
  actions?: InterventionAction[];
  suggestedBreakMinutes?: number; // Only when level === LEVEL_4_BREAK_SUGGESTION
}

// ─── 2.4 Task Breakdown (Feature 3 ↔ Feature 2) ──────────────────────────

export interface TaskDecompositionRequest {
  taskDescription: string;
  difficultyLevel?: "quick" | "moderate" | "complex";
  existingSubtasks?: string[];
}

export interface SubTask {
  stepNumber: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  isImmediateNextStep: boolean;
}

export interface TaskDecompositionResponse {
  originalTask: string;
  subtasks: SubTask[];
}

// ─── 2.5 Focus Recovery (Feature 3 ↔ Feature 2) ──────────────────────────

export interface RecoveryFeedbackRequest {
  sessionId: string;
  currentTask: string;
  userReason: "tired" | "task_confusing" | "distracted" | "need_break" | "other";
  notes?: string;
}

export interface RecoveryFeedbackResponse {
  recommendation: "take_break" | "simplify_task" | "resume_previous" | "custom_tip";
  supportiveMessage: string;
  actionPayload?: {
    suggestedBreakMinutes?: number;
    suggestedNextAction?: string;
  };
}

// ─── Health responses ─────────────────────────────────────────────────────

export interface EngineHealthResponse {
  status: "ok" | "error";
  webcamActive: boolean;
  trackingActive?: boolean;
}

export interface AssistantHealthResponse {
  status: "ok" | "error";
  llmConnected: boolean;
  model: string;
  fallbackMode?: boolean;
}
