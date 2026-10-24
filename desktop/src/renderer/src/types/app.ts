/**
 * Application-local types for FocusGuard desktop UI.
 * Internal to the renderer, extending and adapting shared contract definitions.
 */

import type { AttentionState, SubTask } from "./contracts";

// ─── Session Status ────────────────────────────────────────────────────────

export type SessionStatus = "idle" | "running" | "paused" | "completed" | "active" | "ended";

// ─── Subtask with Completion State ─────────────────────────────────────────

export interface SubTaskItem {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  completed: boolean;
  isImmediateNextStep: boolean;
}

// ─── Focus Session ─────────────────────────────────────────────────────────

export interface FocusSession {
  id: string;
  task: string;
  startTime: string;         // ISO 8601
  endTime?: string;          // ISO 8601
  startedAt: number;         // Milliseconds epoch
  pausedAt: number | null;   // Milliseconds epoch when paused, null when running
  totalPausedMs: number;     // Accumulated paused duration in milliseconds
  totalFocusSeconds: number; // Accurate active focus seconds
  pauseCount: number;
  recoveryCount: number;
  status: SessionStatus;
  subtasks: SubTaskItem[];
  activeSubtaskId: string | null;
}

// ─── Session Insight ───────────────────────────────────────────────────────

export interface SessionInsight {
  id: string;
  timestamp: string;
  message: string;
  metricText?: string;
  type: "positive" | "milestone" | "encouragement";
}

export interface UserPreferences {
  webcamEnabled: boolean;
  notificationsEnabled: boolean;
  mockMode: boolean;
  interventionStyle?: "gentle" | "standard" | "minimal";
  monitoringPaused?: boolean;
}

// ─── Stored Records (Persistence) ─────────────────────────────────────────

export interface StoredSessionRecord {
  id: string;
  task: string;
  startTime: string;
  endTime?: string;
  startedAt: number;
  totalFocusSeconds: number;
  totalPausedSeconds?: number;
  pauseCount: number;
  recoveryCount: number;
  status: "completed" | "abandoned" | "active";
  subtasksCount?: number;
  completedSubtasksCount?: number;
}

export interface StoredInterventionRecord {
  id: string;
  timestamp: string;
  triggerReason: string;
  userAction: "return_to_task" | "break_down_task" | "take_break" | "dismiss" | "unknown";
  sessionId?: string;
  level?: string;
  message?: string;
}

// ─── App-level UI state ───────────────────────────────────────────────────

export type ActivePage = "dashboard" | "analytics" | "settings";

export interface AppState {
  currentPage: ActivePage;
  currentSession: FocusSession | null;
  sessionHistory: FocusSession[];
  currentAttentionState: AttentionState;
  confidence: number;
  recentInsight: SessionInsight | null;
  preferences: UserPreferences;
  engineConnected: boolean;
  assistantConnected: boolean;
  error: string | null;
}

// ─── IPC channel names (must match preload) ────────────────────────────────

export const IPC_CHANNELS = {
  GET_PREFERENCES: "fg:get-preferences",
  SET_PREFERENCES: "fg:set-preferences",
  GET_SESSIONS: "fg:get-sessions",
  SAVE_SESSION: "fg:save-session",
  CLEAR_SESSIONS: "fg:clear-sessions",
  GET_INTERVENTIONS: "fg:get-interventions",
  SAVE_INTERVENTION: "fg:save-intervention",
  CLEAR_HISTORY: "fg:clear-history",
  GET_STORAGE_STATS: "fg:get-storage-stats",
  LOG_ERROR: "fg:log-error",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
