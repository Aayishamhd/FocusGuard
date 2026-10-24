/**
 * App Store — centralized React context for FocusGuard UI state.
 * Manages sessions, timer state transitions, subtask lists, and attention events.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";
import type { AttentionEvent, AttentionState, InterventionDecision, SubTask } from "../types/contracts";
import type {
  ActivePage,
  AppState,
  FocusSession,
  SessionInsight,
  SubTaskItem,
  UserPreferences,
} from "../types/app";
import { validateTaskInput } from "../services/sessionTimer";

import { storageService } from "../services/storageService";

// ─── Actions ───────────────────────────────────────────────────────────────

export type Action =
  | { type: "SET_PAGE"; page: ActivePage }
  | { type: "START_SESSION"; task: string }
  | { type: "PAUSE_SESSION" }
  | { type: "RESUME_SESSION" }
  | { type: "END_SESSION" }
  | { type: "RESET_SESSION" }
  | { type: "UPDATE_TASK"; task: string }
  | { type: "UPDATE_ATTENTION"; event: AttentionEvent }
  | { type: "SIMULATE_ATTENTION_STATE"; state: AttentionState }
  | { type: "SET_SUBTASKS"; subtasks: Array<SubTask | SubTaskItem> }
  | { type: "TOGGLE_SUBTASK"; id: string }
  | { type: "SELECT_ACTIVE_SUBTASK"; id: string }
  | { type: "SET_ENGINE_CONNECTED"; connected: boolean }
  | { type: "SET_ASSISTANT_CONNECTED"; connected: boolean }
  | { type: "SET_PREFERENCES"; preferences: Partial<UserPreferences> }
  | { type: "LOAD_STORAGE_DATA"; preferences: UserPreferences; history: FocusSession[] }
  | { type: "CLEAR_HISTORY"; resetPreferences?: boolean }
  | { type: "SET_ERROR"; error: string | null };

// ─── Initial State ─────────────────────────────────────────────────────────

const INITIAL_PREFERENCES: UserPreferences = {
  webcamEnabled: false,
  notificationsEnabled: true,
  mockMode: true,
};

export const INITIAL_STATE: AppState = {
  currentPage: "dashboard",
  currentSession: null,
  sessionHistory: [],
  currentAttentionState: "IDLE",
  confidence: 0,
  recentInsight: null,
  preferences: INITIAL_PREFERENCES,
  engineConnected: false,
  assistantConnected: false,
  error: null,
};

// ─── Reducer ───────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_PAGE":
      return { ...state, currentPage: action.page, error: null };

    case "START_SESSION": {
      // Prevent duplicate starts if already running or paused
      if (
        state.currentSession &&
        (state.currentSession.status === "running" ||
          state.currentSession.status === "paused" ||
          state.currentSession.status === "active")
      ) {
        return state;
      }

      const validation = validateTaskInput(action.task);
      if (!validation.valid) {
        return { ...state, error: validation.error ?? "Invalid task description." };
      }

      const now = Date.now();
      const newSession: FocusSession = {
        id: uuidv4(),
        task: validation.trimmed,
        startTime: new Date(now).toISOString(),
        startedAt: now,
        pausedAt: null,
        totalPausedMs: 0,
        totalFocusSeconds: 0,
        pauseCount: 0,
        recoveryCount: 0,
        status: "running",
        subtasks: [],
        activeSubtaskId: null,
      };

      return {
        ...state,
        currentSession: newSession,
        currentAttentionState: "FOCUSED",
        confidence: 0.9,
        error: null,
      };
    }

    case "PAUSE_SESSION": {
      if (!state.currentSession) return state;
      // Invalid transition: cannot pause if not running/active
      if (
        state.currentSession.status !== "running" &&
        state.currentSession.status !== "active"
      ) {
        return state;
      }

      const pausedSession: FocusSession = {
        ...state.currentSession,
        status: "paused",
        pausedAt: Date.now(),
        pauseCount: state.currentSession.pauseCount + 1,
      };

      return { ...state, currentSession: pausedSession };
    }

    case "RESUME_SESSION": {
      if (!state.currentSession) return state;
      // Invalid transition: cannot resume if not paused
      if (state.currentSession.status !== "paused") {
        return state;
      }

      const now = Date.now();
      const pausedAt = state.currentSession.pausedAt ?? now;
      const pauseDuration = Math.max(0, now - pausedAt);

      const resumedSession: FocusSession = {
        ...state.currentSession,
        status: "running",
        pausedAt: null,
        totalPausedMs: state.currentSession.totalPausedMs + pauseDuration,
      };

      return { ...state, currentSession: resumedSession };
    }

    case "END_SESSION": {
      if (!state.currentSession) return state;
      // Invalid transition: cannot end if idle or already completed
      if (
        state.currentSession.status === "idle" ||
        state.currentSession.status === "completed" ||
        state.currentSession.status === "ended"
      ) {
        return state;
      }

      const now = Date.now();
      const session = state.currentSession;
      let activeMs = 0;
      if (session.status === "paused" && session.pausedAt !== null) {
        activeMs = session.pausedAt - session.startedAt - session.totalPausedMs;
      } else {
        activeMs = now - session.startedAt - session.totalPausedMs;
      }
      const finalSeconds = Math.max(0, Math.floor(activeMs / 1000));

      const completedSession: FocusSession = {
        ...session,
        status: "completed",
        endTime: new Date(now).toISOString(),
        totalFocusSeconds: finalSeconds,
        pausedAt: null,
      };

      // Generate positive non-punitive session insight
      const minutesFocused = Math.round(finalSeconds / 60);
      let insight: SessionInsight | null = null;
      if (finalSeconds >= 10) {
        insight = {
          id: uuidv4(),
          timestamp: new Date(now).toISOString(),
          type: "positive",
          message:
            minutesFocused > 0
              ? `You dedicated ${minutesFocused} minute${minutesFocused === 1 ? "" : "s"} of intentional focus to "${session.task}". Solid momentum!`
              : `Great start! Completed focus block on "${session.task}".`,
          metricText: `${minutesFocused > 0 ? `${minutesFocused}m` : `${finalSeconds}s`} active focus`,
        };
      }

      // Persist session through storageService (Electron IPC or local fallback)
      void storageService.saveSession({
        id: completedSession.id,
        task: completedSession.task,
        startTime: completedSession.startTime,
        endTime: completedSession.endTime,
        startedAt: completedSession.startedAt,
        totalFocusSeconds: completedSession.totalFocusSeconds,
        totalPausedSeconds: Math.floor(session.totalPausedMs / 1000),
        pauseCount: completedSession.pauseCount,
        recoveryCount: completedSession.recoveryCount,
        status: "completed",
        subtasksCount: completedSession.subtasks.length,
        completedSubtasksCount: completedSession.subtasks.filter((s) => s.completed).length,
      });

      return {
        ...state,
        currentSession: completedSession,
        sessionHistory: [completedSession, ...state.sessionHistory],
        currentAttentionState: "IDLE",
        recentInsight: insight ?? state.recentInsight,
        error: null,
      };
    }

    case "LOAD_STORAGE_DATA":
      return {
        ...state,
        preferences: action.preferences,
        sessionHistory: action.history,
      };

    case "CLEAR_HISTORY":
      return {
        ...state,
        sessionHistory: [],
        recentInsight: null,
        ...(action.resetPreferences ? { preferences: INITIAL_PREFERENCES } : {}),
      };

    case "RESET_SESSION": {
      return {
        ...state,
        currentSession: null,
        currentAttentionState: "IDLE",
        error: null,
      };
    }

    case "UPDATE_TASK": {
      if (!state.currentSession) return state;
      const validation = validateTaskInput(action.task);
      if (!validation.valid) {
        return { ...state, error: validation.error ?? "Invalid task description." };
      }
      return {
        ...state,
        currentSession: {
          ...state.currentSession,
          task: validation.trimmed,
        },
        error: null,
      };
    }

    case "UPDATE_ATTENTION":
      return {
        ...state,
        currentAttentionState: action.event.attentionState,
        confidence: action.event.confidence,
      };

    case "SIMULATE_ATTENTION_STATE":
      return {
        ...state,
        currentAttentionState: action.state,
      };

    case "SET_SUBTASKS": {
      const items: SubTaskItem[] = action.subtasks.map((st, i) => {
        const hasCompleted = "completed" in st ? Boolean(st.completed) : false;
        const id = "id" in st && st.id ? st.id : `subtask-${st.stepNumber ?? i + 1}-${uuidv4().slice(0, 6)}`;
        return {
          id,
          stepNumber: st.stepNumber ?? i + 1,
          title: st.title,
          description: st.description ?? "",
          estimatedMinutes: st.estimatedMinutes ?? 15,
          completed: hasCompleted,
          isImmediateNextStep: i === 0,
        };
      });

      const firstUncompleted = items.find((s) => !s.completed);
      const activeId = firstUncompleted ? firstUncompleted.id : (items[0]?.id ?? null);

      if (state.currentSession) {
        return {
          ...state,
          currentSession: {
            ...state.currentSession,
            subtasks: items,
            activeSubtaskId: activeId,
          },
        };
      }
      return state;
    }

    case "TOGGLE_SUBTASK": {
      if (!state.currentSession) return state;

      const subtasks = state.currentSession.subtasks.map((s) => {
        if (s.id === action.id) {
          return { ...s, completed: !s.completed };
        }
        return s;
      });

      // Advance active subtask to next uncompleted step
      const currentActiveIndex = subtasks.findIndex((s) => s.id === state.currentSession?.activeSubtaskId);
      let nextActiveId = state.currentSession.activeSubtaskId;

      const target = subtasks.find((s) => s.id === action.id);
      if (target?.completed) {
        // If the item just completed was active, find the next uncompleted
        const remaining = subtasks.filter((s, idx) => !s.completed && idx > currentActiveIndex);
        if (remaining.length > 0) {
          nextActiveId = remaining[0].id;
        } else {
          const anyRemaining = subtasks.find((s) => !s.completed);
          nextActiveId = anyRemaining ? anyRemaining.id : null;
        }
      }

      return {
        ...state,
        currentSession: {
          ...state.currentSession,
          subtasks,
          activeSubtaskId: nextActiveId,
        },
      };
    }

    case "SELECT_ACTIVE_SUBTASK": {
      if (!state.currentSession) return state;
      return {
        ...state,
        currentSession: {
          ...state.currentSession,
          activeSubtaskId: action.id,
        },
      };
    }

    case "SET_ENGINE_CONNECTED":
      return { ...state, engineConnected: action.connected };

    case "SET_ASSISTANT_CONNECTED":
      return { ...state, assistantConnected: action.connected };

    case "SET_PREFERENCES": {
      const updatedPrefs = { ...state.preferences, ...action.preferences };
      void storageService.setPreferences(updatedPrefs);
      return {
        ...state,
        preferences: updatedPrefs,
      };
    }

    case "SET_ERROR":
      return { ...state, error: action.error };

    default:
      return state;
  }
}

// ─── Context ───────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  setPage: (page: ActivePage) => void;
  startSession: (task: string) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  resetSession: () => void;
  updateTask: (task: string) => void;
  setError: (error: string | null) => void;
  onIntervention: (decision: InterventionDecision) => void;
  clearHistory: (resetPreferences?: boolean) => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);

  // Load persisted preferences and sessions on startup
  useEffect(() => {
    let mounted = true;
    Promise.all([storageService.getPreferences(), storageService.getSessions()])
      .then(([prefs, sessions]) => {
        if (!mounted) return;
        const history: FocusSession[] = sessions.map((s) => ({
          id: s.id,
          task: s.task,
          startTime: s.startTime,
          endTime: s.endTime,
          startedAt: s.startedAt,
          pausedAt: null,
          totalPausedMs: (s.totalPausedSeconds || 0) * 1000,
          totalFocusSeconds: s.totalFocusSeconds,
          pauseCount: s.pauseCount,
          recoveryCount: s.recoveryCount,
          status: s.status === "completed" ? "completed" : "ended",
          subtasks: [],
          activeSubtaskId: null,
        }));
        dispatch({ type: "LOAD_STORAGE_DATA", preferences: prefs, history });
      })
      .catch((err) => {
        console.warn("[AppStore] Failed to load initial storage data:", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setPage = useCallback((page: ActivePage) => {
    dispatch({ type: "SET_PAGE", page });
  }, []);

  const startSession = useCallback((task: string) => {
    dispatch({ type: "START_SESSION", task });
  }, []);

  const pauseSession = useCallback(() => {
    dispatch({ type: "PAUSE_SESSION" });
  }, []);

  const resumeSession = useCallback(() => {
    dispatch({ type: "RESUME_SESSION" });
  }, []);

  const endSession = useCallback(() => {
    dispatch({ type: "END_SESSION" });
  }, []);

  const resetSession = useCallback(() => {
    dispatch({ type: "RESET_SESSION" });
  }, []);

  const updateTask = useCallback((task: string) => {
    dispatch({ type: "UPDATE_TASK", task });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", error });
  }, []);

  const clearHistory = useCallback(async (resetPreferences?: boolean) => {
    try {
      await storageService.clearHistory({ resetPreferences });
      dispatch({ type: "CLEAR_HISTORY", resetPreferences });
      return true;
    } catch {
      return false;
    }
  }, []);

  const onIntervention = useCallback((decision: InterventionDecision) => {
    // Record intervention to storage
    void storageService.saveIntervention({
      id: decision.decisionId,
      timestamp: decision.timestamp,
      triggerReason: decision.triggerReason,
      userAction: "unknown",
      sessionId: state.currentSession?.id,
      level: decision.level,
      message: decision.message,
    });

    if (state.currentSession) {
      const updatedSession: FocusSession = {
        ...state.currentSession,
        recoveryCount: state.currentSession.recoveryCount + 1,
      };
      // Keep recovery count in sync
      dispatch({
        type: "UPDATE_ATTENTION",
        event: {
          eventId: "local-recovery",
          timestamp: new Date().toISOString(),
          attentionState: "RECOVERING",
          confidence: 0.8,
          activeApp: {
            appName: "FocusGuard",
            windowTitle: "Focus Recovery",
            category: "work",
          },
          metrics: {
            sessionDurationSeconds: updatedSession.totalFocusSeconds,
            appDurationSeconds: 60,
            recentSwitchCount: 0,
            inactivitySeconds: 0,
          },
          sources: ["activity_monitor"],
        },
      });
    }
  }, [state.currentSession]);

  const value: AppContextValue = {
    state,
    dispatch,
    setPage,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    resetSession,
    updateTask,
    setError,
    onIntervention,
    clearHistory,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppStore must be used inside AppProvider");
  return ctx;
}
