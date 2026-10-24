/**
 * useIntervention — periodically queries the assistant service to evaluate
 * whether human-centered intervention is warranted.
 *
 * Enforces:
 * 1. Notification preferences (suppressed when notifications disabled)
 * 2. No intervention stacking
 * 3. Cooldown suppression window after dismissal or action
 * 4. Support for all Intervention Levels (1 through 4)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getAssistantService } from "../services/serviceManager";
import { useAppStore } from "../store/appStore";
import type { AttentionEvent, InterventionDecision } from "../types/contracts";

const CHECK_INTERVAL_MS = 6000;
export const INTERVENTION_COOLDOWN_MS = 45000; // 45 seconds suppression window

export function useIntervention(): {
  activeIntervention: InterventionDecision | null;
  dismissIntervention: (cooldownMs?: number) => void;
  triggerManualIntervention: (decision?: InterventionDecision) => void;
  isSuppressed: () => boolean;
} {
  const { state, dispatch } = useAppStore();
  const [activeIntervention, setActiveIntervention] = useState<InterventionDecision | null>(null);

  const lastEventRef = useRef<AttentionEvent | null>(null);
  const isCheckingRef = useRef(false);
  const suppressedUntilRef = useRef<number>(0);

  const isSessionRunning =
    state.currentSession?.status === "running" ||
    state.currentSession?.status === "active";

  // Keep a ref to the latest attention event
  useEffect(() => {
    if (state.currentAttentionState && isSessionRunning) {
      lastEventRef.current = {
        eventId: "local-ref",
        timestamp: new Date().toISOString(),
        attentionState: state.currentAttentionState,
        confidence: state.confidence,
        activeApp: {
          appName: state.currentAttentionState === "DISTRACTED" ? "Browser" : "Code Editor",
          windowTitle: state.currentSession?.task ?? "Focus Work",
          category: state.currentAttentionState === "DISTRACTED" ? "entertainment" : "work",
        },
        metrics: {
          sessionDurationSeconds: state.currentSession?.totalFocusSeconds ?? 0,
          appDurationSeconds: 120,
          recentSwitchCount: state.currentAttentionState === "DISTRACTED" ? 5 : 1,
          inactivitySeconds: state.currentAttentionState === "POSSIBLY_DRIFTING" ? 15 : 2,
        },
        sources: ["activity_monitor"],
      };
    }
  }, [state.currentAttentionState, state.confidence, state.currentSession, isSessionRunning]);

  // If session ends or resets, ensure no stale intervention toast remains
  useEffect(() => {
    if (!isSessionRunning && activeIntervention) {
      setActiveIntervention(null);
    }
  }, [isSessionRunning, activeIntervention]);

  const checkIntervention = useCallback(async () => {
    if (isCheckingRef.current) return;
    if (!lastEventRef.current) return;
    if (!isSessionRunning) return;
    if (activeIntervention) return; // Prevent duplicate stacking

    // Respect notification preferences
    if (!state.preferences.notificationsEnabled) return;

    // Respect cooldown suppression window
    if (Date.now() < suppressedUntilRef.current) return;

    isCheckingRef.current = true;
    try {
      const decision = await getAssistantService().intervene(lastEventRef.current);
      if (decision.shouldIntervene && decision.level !== "LEVEL_0_NONE") {
        setActiveIntervention(decision);
        dispatch({ type: "SET_ASSISTANT_CONNECTED", connected: true });
      }
    } catch (err) {
      console.warn("[useIntervention] Assistant query error:", err);
      dispatch({ type: "SET_ASSISTANT_CONNECTED", connected: false });
    } finally {
      isCheckingRef.current = false;
    }
  }, [isSessionRunning, activeIntervention, state.preferences.notificationsEnabled, dispatch]);

  useEffect(() => {
    const id = setInterval(() => {
      void checkIntervention();
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [checkIntervention]);

  const dismissIntervention = useCallback((cooldownMs = INTERVENTION_COOLDOWN_MS) => {
    setActiveIntervention(null);
    suppressedUntilRef.current = Date.now() + cooldownMs;
  }, []);

  const triggerManualIntervention = useCallback((customDecision?: InterventionDecision) => {
    if (customDecision) {
      setActiveIntervention(customDecision);
    } else {
      // Trigger a default Level 2 suggestion
      setActiveIntervention({
        decisionId: "manual-dev-dec",
        timestamp: new Date().toISOString(),
        shouldIntervene: true,
        level: "LEVEL_2_RECOVERY_SUGGESTION",
        triggerReason: "Simulated distraction intervention",
        message: "Looks like your attention may have shifted. Would you like to return to your last step?",
        actions: [
          { actionId: "return_to_task", label: "Return to Task" },
          { actionId: "break_down_task", label: "Break Down Task" },
          { actionId: "take_break", label: "Take a Break" },
          { actionId: "dismiss", label: "Dismiss" },
        ],
      });
    }
  }, []);

  const isSuppressed = useCallback(() => {
    return Date.now() < suppressedUntilRef.current;
  }, []);

  return {
    activeIntervention,
    dismissIntervention,
    triggerManualIntervention,
    isSuppressed,
  };
}
