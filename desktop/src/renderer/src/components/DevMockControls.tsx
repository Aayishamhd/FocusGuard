import React, { useState } from "react";
import {
  Wrench,
  Zap,
  Compass,
  EyeOff,
  RefreshCw,
  WifiOff,
  Clock,
  Sparkles,
  Coffee,
  HelpCircle,
  Scissors,
  FileQuestion,
  BellOff,
  Bell,
} from "lucide-react";
import type { AttentionState, InterventionLevel } from "../types/contracts";
import { notificationService } from "../services/notificationService";
import {
  getMockEngineClient,
  getMockAssistantClient,
  isUsingMocks,
  getEngineUrl,
  getAssistantUrl,
} from "../services/serviceManager";
import { useAppStore } from "../store/appStore";

interface Props {
  onTriggerIntervention?: (level?: InterventionLevel) => void;
  onOpenRecovery?: () => void;
  onOpenBreak?: () => void;
  onOpenDecompose?: () => void;
}

export function DevMockControls({
  onTriggerIntervention,
  onOpenRecovery,
  onOpenBreak,
  onOpenDecompose,
}: Props): JSX.Element | null {
  // Completely excluded from production builds
  if (!import.meta.env.DEV) {
    return null;
  }

  const { dispatch } = useAppStore();
  const [delayed, setDelayed] = useState(false);
  const [engineOffline, setEngineOffline] = useState(false);
  const [assistantOffline, setAssistantOffline] = useState(false);
  const [emptyDecomposition, setEmptyDecomposition] = useState(false);

  const mockEngine = getMockEngineClient();
  const mockAssistant = getMockAssistantClient();

  const handleSimulateState = (attentionState: AttentionState) => {
    if (mockEngine) {
      mockEngine.forceAttentionState(attentionState);
    }
    dispatch({ type: "SIMULATE_ATTENTION_STATE", state: attentionState });
  };

  const handleToggleEngineUnavailable = () => {
    const next = !engineOffline;
    setEngineOffline(next);
    if (mockEngine) {
      mockEngine.simulateEngineUnavailable(next);
    }
    dispatch({ type: "SET_ENGINE_CONNECTED", connected: !next });
    if (next) {
      dispatch({ type: "SET_ERROR", error: "Simulated Engine disconnect: Engine is unavailable." });
    } else {
      dispatch({ type: "SET_ERROR", error: null });
    }
  };

  const handleToggleAssistantUnavailable = () => {
    const next = !assistantOffline;
    setAssistantOffline(next);
    if (mockAssistant) {
      mockAssistant.simulateUnavailable = next;
    }
    dispatch({ type: "SET_ASSISTANT_CONNECTED", connected: !next });
    if (next) {
      dispatch({ type: "SET_ERROR", error: "Simulated Assistant 503 error: AI reasoning unavailable." });
    } else {
      dispatch({ type: "SET_ERROR", error: null });
    }
  };

  const handleToggleEmptyDecomposition = () => {
    const next = !emptyDecomposition;
    setEmptyDecomposition(next);
    if (mockAssistant) {
      mockAssistant.simulateEmptyDecomposition = next;
    }
  };

  const handleToggleDelay = () => {
    const next = !delayed;
    setDelayed(next);
    if (mockEngine) {
      mockEngine.setResponseDelay(next ? 2000 : 0);
    }
    if (mockAssistant) {
      mockAssistant.responseDelayMs = next ? 2000 : 0;
    }
  };

  const mockMode = isUsingMocks();

  return (
    <aside className="card dev-controls-card" aria-label="Developer mock controls">
      <div className="dev-controls-card__header">
        <div className="dev-controls-card__title">
          <Wrench size={14} color="var(--accent-400)" />
          <span>DEV CONTROLS &bull; Simulation Sandbox</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`badge ${mockMode ? "badge-mock" : "badge-focused"}`}>
            {mockMode ? "MOCK MODE" : "LIVE MODE"}
          </span>
          <span className="badge badge-subtle">DEV ONLY</span>
        </div>
      </div>

      {/* Mode Diagnostic Banner */}
      <div
        style={{
          fontSize: 11.5,
          color: "var(--text-secondary)",
          background: "var(--bg-elevated)",
          padding: "6px 10px",
          borderRadius: "var(--radius-sm)",
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          <strong>Target:</strong> {mockMode ? "Internal Synthesizer" : `Engine (${getEngineUrl()}) + Assistant (${getAssistantUrl()})`}
        </span>
        <span className="text-muted">{mockMode ? "VITE_USE_MOCKS=true" : "VITE_USE_MOCKS=false"}</span>
      </div>

      <div className="dev-controls-card__grid">
        {/* 1. Attention State Overrides */}
        <div className="dev-controls-card__group">
          <span className="dev-controls-card__sublabel">Attention State Override:</span>
          <div className="dev-controls-card__btn-row">
            <button
              id="dev-simulate-focused"
              className="btn btn-sm btn-ghost dev-btn dev-btn--focused"
              onClick={() => handleSimulateState("FOCUSED")}
              title="Force Focused attention"
            >
              <Zap size={12} />
              Focused
            </button>
            <button
              id="dev-simulate-drifting"
              className="btn btn-sm btn-ghost dev-btn dev-btn--drifting"
              onClick={() => handleSimulateState("POSSIBLY_DRIFTING")}
              title="Force Possibly Drifting attention"
            >
              <Compass size={12} />
              Drifting
            </button>
            <button
              id="dev-simulate-distracted"
              className="btn btn-sm btn-ghost dev-btn dev-btn--distracted"
              onClick={() => handleSimulateState("DISTRACTED")}
              title="Force Distracted attention"
            >
              <EyeOff size={12} />
              Distracted
            </button>
            <button
              id="dev-simulate-recovering"
              className="btn btn-sm btn-ghost dev-btn dev-btn--recovering"
              onClick={() => handleSimulateState("RECOVERING")}
              title="Force Recovering attention"
            >
              <RefreshCw size={12} />
              Recovering
            </button>
          </div>
        </div>

        {/* 2. Intervention Levels */}
        {onTriggerIntervention && (
          <div className="dev-controls-card__group">
            <span className="dev-controls-card__sublabel">Intervention Recommendations:</span>
            <div className="dev-controls-card__btn-row">
              <button
                id="dev-intervene-l1"
                className="btn btn-sm btn-ghost"
                onClick={() => onTriggerIntervention("LEVEL_1_GENTLE_REMINDER")}
                title="Trigger Level 1 Gentle Reminder"
              >
                <Sparkles size={12} />
                L1: Reminder
              </button>
              <button
                id="dev-intervene-l2"
                className="btn btn-sm btn-ghost"
                onClick={() => onTriggerIntervention("LEVEL_2_RECOVERY_SUGGESTION")}
                title="Trigger Level 2 Recovery Suggestion"
              >
                <RefreshCw size={12} />
                L2: Recovery
              </button>
              <button
                id="dev-intervene-l3"
                className="btn btn-sm btn-ghost"
                onClick={() => onTriggerIntervention("LEVEL_3_ASSISTANCE")}
                title="Trigger Level 3 Assistance"
              >
                <Scissors size={12} />
                L3: Stuck Help
              </button>
              <button
                id="dev-intervene-l4"
                className="btn btn-sm btn-ghost"
                onClick={() => onTriggerIntervention("LEVEL_4_BREAK_SUGGESTION")}
                title="Trigger Level 4 Break Suggestion"
              >
                <Coffee size={12} />
                L4: Break
              </button>
            </div>
          </div>
        )}

        {/* 3. Assistant & Network Faults */}
        <div className="dev-controls-card__group">
          <span className="dev-controls-card__sublabel">Service Fault & Scenario Simulation:</span>
          <div className="dev-controls-card__btn-row">
            <button
              id="dev-toggle-engine-offline"
              className={`btn btn-sm ${engineOffline ? "btn-danger" : "btn-secondary"}`}
              onClick={handleToggleEngineUnavailable}
              title="Simulate engine disconnection"
            >
              <WifiOff size={12} />
              {engineOffline ? "Restore Engine" : "Engine Offline"}
            </button>

            <button
              id="dev-toggle-assistant-offline"
              className={`btn btn-sm ${assistantOffline ? "btn-danger" : "btn-secondary"}`}
              onClick={handleToggleAssistantUnavailable}
              title="Simulate assistant 503 error"
            >
              <WifiOff size={12} />
              {assistantOffline ? "Restore Assistant" : "Assistant 503"}
            </button>

            <button
              id="dev-toggle-empty-decompose"
              className={`btn btn-sm ${emptyDecomposition ? "btn-danger" : "btn-ghost"}`}
              onClick={handleToggleEmptyDecomposition}
              title="Simulate empty task breakdown"
            >
              <FileQuestion size={12} />
              {emptyDecomposition ? "Empty Decompose: ON" : "Simulate Empty Decompose"}
            </button>

            <button
              id="dev-toggle-delay"
              className={`btn btn-sm ${delayed ? "btn-secondary" : "btn-ghost"}`}
              onClick={handleToggleDelay}
              title="Add 2s simulated artificial latency"
            >
              <Clock size={12} />
              {delayed ? "2s Delay: Active" : "Simulate 2s Latency"}
            </button>
          </div>
        </div>

        {/* 4. Quick Component Launchers */}
        <div className="dev-controls-card__group">
          <span className="dev-controls-card__sublabel">Direct Component Launchers:</span>
          <div className="dev-controls-card__btn-row">
            {onOpenRecovery && (
              <button
                id="dev-launch-recovery"
                className="btn btn-sm btn-ghost"
                onClick={onOpenRecovery}
                title="Open Focus Recovery modal"
              >
                <HelpCircle size={12} />
                Open Recovery Modal
              </button>
            )}

            {onOpenBreak && (
              <button
                id="dev-launch-break"
                className="btn btn-sm btn-ghost"
                onClick={onOpenBreak}
                title="Launch Mindful Break Mode"
              >
                <Coffee size={12} />
                Launch Break Mode
              </button>
            )}

            {onOpenDecompose && (
              <button
                id="dev-launch-decompose"
                className="btn btn-sm btn-ghost"
                onClick={onOpenDecompose}
                title="Open Task Decomposition modal"
              >
                <Scissors size={12} />
                Open Decompose Modal
              </button>
            )}
          </div>
        </div>

        {/* 5. Native Desktop Notifications (OS-level) */}
        <div className="dev-controls-card__group">
          <span className="dev-controls-card__sublabel">Native Desktop Notifications (OS-level):</span>
          <div className="dev-controls-card__btn-row">
            <button
              id="dev-notify-reminder"
              className="btn btn-sm btn-ghost"
              onClick={() => void notificationService.notifyFocusReminder(undefined, true)}
              title="Test Focus Reminder Notification"
            >
              <Bell size={12} />
              Test Reminder
            </button>

            <button
              id="dev-notify-distraction"
              className="btn btn-sm btn-ghost"
              onClick={() => void notificationService.notifyDistraction(undefined, true)}
              title="Test Distraction Notification"
            >
              <Bell size={12} />
              Test Distraction
            </button>

            <button
              id="dev-notify-recovery"
              className="btn btn-sm btn-ghost"
              onClick={() => void notificationService.notifyRecovery(undefined, true)}
              title="Test Recovery Notification"
            >
              <Bell size={12} />
              Test Recovery
            </button>

            <button
              id="dev-notify-stuck"
              className="btn btn-sm btn-ghost"
              onClick={() => void notificationService.notifyStuckHelp(undefined, true)}
              title="Test Stuck / AI Help Notification"
            >
              <Bell size={12} />
              Test Stuck / AI Help
            </button>

            <button
              id="dev-notify-break"
              className="btn btn-sm btn-ghost"
              onClick={() => void notificationService.notifyBreakSuggestion(5, true)}
              title="Test Break Notification"
            >
              <Coffee size={12} />
              Test Break
            </button>

            <button
              id="dev-notify-complete"
              className="btn btn-sm btn-ghost"
              onClick={() => void notificationService.notifySessionCompleted("25 mins", true)}
              title="Test Session Completed Notification"
            >
              <Sparkles size={12} />
              Test Complete
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
