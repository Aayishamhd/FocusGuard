import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Square,
  Scissors,
  HelpCircle,
  Pencil,
  Check,
  X,
  Coffee,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useEngine } from "../hooks/useEngine";
import { useIntervention } from "../hooks/useIntervention";
import { AttentionBadge } from "../components/AttentionBadge";
import { DashboardHeader } from "../components/DashboardHeader";
import { SubtaskList } from "../components/SubtaskList";
import { SessionSummaryCard } from "../components/SessionSummaryCard";
import { EndSessionModal } from "../components/EndSessionModal";
import { RecentInsightCard } from "../components/RecentInsightCard";
import { PrivacyCard } from "../components/PrivacyCard";
import { DevMockControls } from "../components/DevMockControls";
import { InterventionToast } from "../components/Intervention";
import { RecoveryModal } from "../components/RecoveryModal";
import { BreakMode } from "../components/BreakMode";
import { TaskDecomposeModal } from "../components/TaskDecomposeModal";
import { useSessionTimer, validateTaskInput, MAX_TASK_LENGTH } from "../services/sessionTimer";
import type { InterventionLevel, SubTask } from "../types/contracts";

export function Dashboard(): JSX.Element {
  const {
    state,
    dispatch,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    resetSession,
    updateTask,
    setPage,
  } = useAppStore();

  const { startMonitoring, pauseMonitoring } = useEngine();
  const {
    activeIntervention,
    dismissIntervention,
    triggerManualIntervention,
  } = useIntervention();

  // Local UI states
  const [taskInput, setTaskInput] = useState("");
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingTaskValue, setEditingTaskValue] = useState("");
  const [taskValidationError, setTaskValidationError] = useState<string | null>(null);

  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showBreakMode, setShowBreakMode] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [showDecomposeModal, setShowDecomposeModal] = useState(false);

  // Focus reference element to restore focus when modals close
  const recoveryTriggerRef = useRef<HTMLButtonElement | null>(null);

  const currentSession = state.currentSession;
  const isRunning = currentSession?.status === "running" || currentSession?.status === "active";
  const isPaused = currentSession?.status === "paused";
  const isCompleted = currentSession?.status === "completed" || currentSession?.status === "ended";
  const hasActiveOrPausedSession = isRunning || isPaused;

  // Accurate timestamp-calculated timer
  const { formattedTime } = useSessionTimer(currentSession);

  // ─── Task Input & Start ───────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    const validation = validateTaskInput(taskInput);
    if (!validation.valid) {
      setTaskValidationError(validation.error ?? "Invalid task description.");
      return;
    }
    setTaskValidationError(null);
    startSession(validation.trimmed);
    setTaskInput("");
    await startMonitoring();
  }, [taskInput, startSession, startMonitoring]);

  const handleSaveEditedTask = useCallback(() => {
    const validation = validateTaskInput(editingTaskValue);
    if (!validation.valid) {
      setTaskValidationError(validation.error ?? "Invalid task description.");
      return;
    }
    setTaskValidationError(null);
    updateTask(validation.trimmed);
    setIsEditingTask(false);
  }, [editingTaskValue, updateTask]);

  const handleStartEditingTask = useCallback(() => {
    if (!currentSession) return;
    setEditingTaskValue(currentSession.task);
    setTaskValidationError(null);
    setIsEditingTask(true);
  }, [currentSession]);

  // ─── Session Lifecycle ────────────────────────────────────────────────────

  const handlePause = useCallback(async () => {
    pauseSession();
    await pauseMonitoring();
  }, [pauseSession, pauseMonitoring]);

  const handleResume = useCallback(async () => {
    resumeSession();
    await startMonitoring();
  }, [resumeSession, startMonitoring]);

  const handleRequestEndSession = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const handleConfirmEndSession = useCallback(() => {
    setShowEndConfirm(false);
    dismissIntervention();
    endSession();
    pauseMonitoring().catch(() => {});
  }, [endSession, pauseMonitoring, dismissIntervention]);

  // ─── Break Mode Workflows ─────────────────────────────────────────────────

  const handleStartBreak = useCallback(
    (minutes = 5) => {
      setBreakMinutes(minutes);
      setShowBreakMode(true);
      void handlePause();
    },
    [handlePause]
  );

  const handleResumeFromBreak = useCallback(() => {
    setShowBreakMode(false);
    void handleResume();
  }, [handleResume]);

  // ─── Intervention Actions (Level 1-4) ────────────────────────────────────

  const handleInterventionAction = useCallback(
    (actionId: string) => {
      if (actionId === "return_to_task") {
        dispatch({ type: "SIMULATE_ATTENTION_STATE", state: "RECOVERING" });
        if (isPaused) void handleResume();
      } else if (actionId === "break_down_task") {
        setShowDecomposeModal(true);
      } else if (actionId === "take_break") {
        const mins = activeIntervention?.suggestedBreakMinutes ?? 5;
        handleStartBreak(mins);
      }
      dismissIntervention();
    },
    [activeIntervention, isPaused, handleResume, handleStartBreak, dismissIntervention, dispatch]
  );

  // ─── Task Decomposition ───────────────────────────────────────────────────

  const handleApplyDecomposedSubtasks = useCallback(
    (subtasks: SubTask[]) => {
      dispatch({ type: "SET_SUBTASKS", subtasks });
      dispatch({ type: "SET_ASSISTANT_CONNECTED", connected: true });
    },
    [dispatch]
  );

  // ─── Subtask Checklist Actions ────────────────────────────────────────────

  const handleToggleSubtask = useCallback(
    (id: string) => {
      dispatch({ type: "TOGGLE_SUBTASK", id });
    },
    [dispatch]
  );

  const handleSelectActiveSubtask = useCallback(
    (id: string) => {
      dispatch({ type: "SELECT_ACTIVE_SUBTASK", id });
    },
    [dispatch]
  );

  // ─── System Tray Quick-Action Listener ────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && window.focusGuard?.onTrayCommand) {
      const unsubscribe = window.focusGuard.onTrayCommand((command: string) => {
        if (command === "start-or-resume") {
          if (!currentSession) {
            void handleStart();
          } else if (currentSession.status === "paused") {
            void handleResume();
          }
        } else if (command === "toggle-monitoring") {
          if (isPaused) {
            void handleResume();
          } else if (isRunning) {
            void handlePause();
          }
        }
      });
      return unsubscribe;
    }
  }, [currentSession, isPaused, isRunning, handleStart, handleResume, handlePause]);

  return (
    <div className="dashboard fade-in">
      {/* ── Active Intervention Toast (Feature 2 & 3) ── */}
      {activeIntervention && (
        <div className="dashboard__intervention" aria-live="assertive">
          <InterventionToast
            decision={activeIntervention}
            onAction={handleInterventionAction}
            onDismiss={dismissIntervention}
          />
        </div>
      )}

      {/* ── Dashboard Header ── */}
      <DashboardHeader
        sessionStatus={currentSession ? currentSession.status : "idle"}
        engineConnected={state.engineConnected}
        onOpenSettings={() => setPage("settings")}
      />

      <div className="dashboard__grid">
        {/* ── Main Left Column ── */}
        <div className="dashboard__main-col">
          {/* 1. Current Task Card */}
          <section className="card dashboard__task-card" aria-label="Current focus task">
            <div className="dashboard__task-header">
              <span className="section-title">Current Focal Goal</span>
              {hasActiveOrPausedSession && (
                <AttentionBadge
                  state={state.currentAttentionState}
                  confidence={state.confidence}
                  showDescription={false}
                />
              )}
            </div>

            {/* When session is active or paused: display task or edit inline */}
            {hasActiveOrPausedSession && currentSession && (
              <div className="dashboard__active-task-display">
                {isEditingTask ? (
                  <div className="dashboard__task-edit-row">
                    <input
                      id="input-edit-task"
                      className="input input--edit-task"
                      type="text"
                      value={editingTaskValue}
                      maxLength={MAX_TASK_LENGTH}
                      onChange={(e) => {
                        setEditingTaskValue(e.target.value);
                        setTaskValidationError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEditedTask();
                        if (e.key === "Escape") setIsEditingTask(false);
                      }}
                      autoFocus
                      aria-label="Edit task description"
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveEditedTask}
                      aria-label="Save updated task description"
                    >
                      <Check size={14} />
                      Save
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setIsEditingTask(false)}
                      aria-label="Cancel editing"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="dashboard__task-title-row">
                    <h2 className="dashboard__task-title">{currentSession.task}</h2>
                    <button
                      id="btn-edit-task"
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={handleStartEditingTask}
                      title="Edit task description"
                      aria-label="Edit task description"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}
                {taskValidationError && (
                  <p className="validation-error" role="alert">
                    {taskValidationError}
                  </p>
                )}
              </div>
            )}

            {/* When idle or completed: Show input with start form and guidance */}
            {!hasActiveOrPausedSession && (
              <div className="dashboard__start-form">
                <p className="dashboard__guidance">
                  Define an intentional, single-task goal to anchor your focus block.
                </p>
                <div className="dashboard__input-row">
                  <input
                    id="task-input"
                    className="input"
                    type="text"
                    placeholder="e.g. Prepare my project presentation..."
                    value={taskInput}
                    maxLength={MAX_TASK_LENGTH}
                    onChange={(e) => {
                      setTaskInput(e.target.value);
                      setTaskValidationError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleStart();
                    }}
                    aria-label="New focus task goal"
                  />
                  <button
                    id="start-session"
                    className="btn btn-primary btn-lg"
                    onClick={() => void handleStart()}
                    aria-label="Start focus session"
                  >
                    <Play size={16} />
                    Start Session
                  </button>
                </div>
                {taskValidationError && (
                  <p className="validation-error" role="alert">
                    {taskValidationError}
                  </p>
                )}
              </div>
            )}

            {/* 2. Focus Session Timer & Controls */}
            {hasActiveOrPausedSession && (
              <div className="dashboard__session-controls">
                <div className="dashboard__timer-wrap">
                  <div
                    className="dashboard__timer font-mono"
                    aria-label={`Elapsed focus time: ${formattedTime}`}
                  >
                    {formattedTime}
                  </div>
                  <span className="dashboard__timer-caption">
                    {isRunning ? "Active Focus Time" : "Session Paused"}
                  </span>
                </div>

                <div className="dashboard__actions">
                  {isRunning ? (
                    <button
                      id="pause-session"
                      className="btn btn-secondary"
                      onClick={() => void handlePause()}
                      aria-label="Pause focus session"
                    >
                      <Pause size={15} />
                      Pause
                    </button>
                  ) : (
                    <button
                      id="resume-session"
                      className="btn btn-secondary"
                      onClick={() => void handleResume()}
                      aria-label="Resume focus session"
                    >
                      <Play size={15} />
                      Resume
                    </button>
                  )}

                  <button
                    id="end-session"
                    className="btn btn-ghost"
                    onClick={handleRequestEndSession}
                    aria-label="End session"
                  >
                    <Square size={15} />
                    End Session
                  </button>

                  <button
                    id="btn-take-break"
                    className="btn btn-ghost"
                    onClick={() => handleStartBreak(5)}
                    title="Take a mindful 5-minute break"
                    aria-label="Take a 5-minute break"
                  >
                    <Coffee size={15} />
                    Take a Break
                  </button>

                  <button
                    id="decompose-task"
                    className="btn btn-ghost"
                    onClick={() => setShowDecomposeModal(true)}
                    title="Break task into manageable subtasks"
                    aria-label="Break task into manageable subtasks"
                  >
                    <Scissors size={15} />
                    Break Down
                  </button>

                  <button
                    ref={recoveryTriggerRef}
                    id="recovery-help"
                    className="btn btn-ghost"
                    onClick={() => setShowRecovery(true)}
                    title="Need help refocusing? Open recovery modal"
                    aria-label="I'm stuck, help me refocus"
                  >
                    <HelpCircle size={15} />
                    I&apos;m Stuck
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 3. Session Concluded Summary Card */}
          {isCompleted && currentSession && (
            <SessionSummaryCard
              session={currentSession}
              onStartNewSession={() => {
                resetSession();
                setTaskInput("");
                setTaskValidationError(null);
              }}
            />
          )}

          {/* 4. Subtasks Checklist */}
          {hasActiveOrPausedSession && currentSession && (
            <section className="card dashboard__subtasks-section" aria-label="Session Subtasks">
              <SubtaskList
                subtasks={currentSession.subtasks}
                activeSubtaskId={currentSession.activeSubtaskId}
                onToggle={handleToggleSubtask}
                onSelectActive={handleSelectActiveSubtask}
                onRequestBreakdown={() => setShowDecomposeModal(true)}
                loading={false}
              />
            </section>
          )}

          {/* 5. Dev Mock Controls (only rendered in dev mode) */}
          <DevMockControls
            onTriggerIntervention={(level?: InterventionLevel) => triggerManualIntervention(
              level
                ? {
                    decisionId: `manual-${level}`,
                    timestamp: new Date().toISOString(),
                    shouldIntervene: true,
                    level,
                    triggerReason: `Simulated ${level}`,
                    message:
                      level === "LEVEL_4_BREAK_SUGGESTION"
                        ? "You've been in deep focus for 90 minutes. Would a 5-minute break recharge you?"
                        : level === "LEVEL_3_ASSISTANCE"
                        ? "This task seems heavy. Want to break it into small steps?"
                        : "Looks like your attention may have shifted. Would you like to return to your last step?",
                    actions: [
                      { actionId: "return_to_task", label: "Return to Task" },
                      { actionId: "break_down_task", label: "Break Down Task" },
                      { actionId: "take_break", label: "Take a Break" },
                      { actionId: "dismiss", label: "Dismiss" },
                    ],
                    suggestedBreakMinutes: level === "LEVEL_4_BREAK_SUGGESTION" ? 5 : undefined,
                  }
                : undefined
            )}
            onOpenRecovery={() => setShowRecovery(true)}
            onOpenBreak={() => handleStartBreak(5)}
            onOpenDecompose={() => setShowDecomposeModal(true)}
          />
        </div>

        {/* ── Sidebar Right Column (Insights & Privacy) ── */}
        <div className="dashboard__side-col">
          {/* Attention State Detailed Card */}
          {hasActiveOrPausedSession && (
            <section className="card attention-detail-card" aria-label="Attention feedback">
              <span className="section-title">Attention State Analysis</span>
              <AttentionBadge
                state={state.currentAttentionState}
                confidence={state.confidence}
                showDescription={true}
              />
            </section>
          )}

          {/* Recent Insight */}
          <RecentInsightCard insight={state.recentInsight} />

          {/* Privacy Summary */}
          <PrivacyCard
            webcamEnabled={state.preferences.webcamEnabled}
            sessionStatus={currentSession ? currentSession.status : "idle"}
            engineConnected={state.engineConnected}
          />
        </div>
      </div>

      {/* ── Task Decomposition Modal ── */}
      {showDecomposeModal && (
        <TaskDecomposeModal
          initialTask={currentSession?.task || taskInput}
          onApplySubtasks={handleApplyDecomposedSubtasks}
          onClose={() => setShowDecomposeModal(false)}
        />
      )}

      {/* ── End Session Confirmation Modal ── */}
      {showEndConfirm && currentSession && (
        <EndSessionModal
          taskName={currentSession.task}
          onConfirm={handleConfirmEndSession}
          onCancel={() => setShowEndConfirm(false)}
        />
      )}

      {/* ── Refocus Recovery Modal ("What happened?") ── */}
      {showRecovery && currentSession && (
        <RecoveryModal
          sessionId={currentSession.id}
          currentTask={currentSession.task}
          onClose={() => setShowRecovery(false)}
          onTakeBreak={(mins) => handleStartBreak(mins)}
          onDecomposeTask={() => setShowDecomposeModal(true)}
          onResumeTask={() => {
            if (isPaused) void handleResume();
          }}
        />
      )}

      {/* ── Mindful Break Mode Overlay ── */}
      {showBreakMode && (
        <BreakMode
          breakDurationMinutes={breakMinutes}
          taskName={currentSession?.task || "your focus task"}
          onResumeFocus={handleResumeFromBreak}
        />
      )}
    </div>
  );
}
