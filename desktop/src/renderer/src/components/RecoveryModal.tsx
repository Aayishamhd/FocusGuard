import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  X,
  Loader2,
  Coffee,
  Scissors,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { getAssistantService } from "../services/serviceManager";
import type { RecoveryFeedbackRequest, RecoveryFeedbackResponse } from "../types/contracts";

interface Props {
  sessionId: string;
  currentTask: string;
  onClose: () => void;
  onTakeBreak?: (minutes: number) => void;
  onDecomposeTask?: () => void;
  onResumeTask?: () => void;
}

type ReasonOption = {
  id: RecoveryFeedbackRequest["userReason"];
  label: string;
  description: string;
  emoji: string;
};

const REASON_OPTIONS: ReasonOption[] = [
  {
    id: "tired",
    label: "I'm tired",
    description: "Physical or mental fatigue setting in",
    emoji: "😴",
  },
  {
    id: "task_confusing",
    label: "The task is confusing",
    description: "Unclear scope or overwhelming complexity",
    emoji: "🧩",
  },
  {
    id: "distracted",
    label: "I got distracted",
    description: "Sidetracked by notifications, tabs, or impulse",
    emoji: "🌊",
  },
  {
    id: "need_break",
    label: "I need a break",
    description: "Ready for an intentional pause",
    emoji: "☕",
  },
];

export function RecoveryModal({
  sessionId,
  currentTask,
  onClose,
  onTakeBreak,
  onDecomposeTask,
  onResumeTask,
}: Props): JSX.Element {
  const [selectedReason, setSelectedReason] = useState<RecoveryFeedbackRequest["userReason"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<RecoveryFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Focus preservation: save previously focused element to restore on close
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const modalBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Restore focus to invoking control
      previousActiveElementRef.current?.focus();
    };
  }, [onClose]);

  const handleSubmit = useCallback(
    async (reasonToSubmit?: RecoveryFeedbackRequest["userReason"]) => {
      const reason = reasonToSubmit ?? selectedReason;
      if (!reason) return;

      setLoading(true);
      setError(null);
      try {
        const result = await getAssistantService().recover({
          sessionId,
          currentTask,
          userReason: reason,
        });
        setResponse(result);
      } catch {
        setError("Unable to reach assistant service. You can retry or return to your session.");
      } finally {
        setLoading(false);
      }
    },
    [selectedReason, sessionId, currentTask]
  );

  const handleSelectAndSubmit = (reason: RecoveryFeedbackRequest["userReason"]) => {
    setSelectedReason(reason);
    void handleSubmit(reason);
  };

  return (
    <div
      className="modal-overlay fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-modal-title"
      aria-describedby="recovery-modal-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-box" ref={modalBoxRef}>
        <div className="modal-box__header">
          <div className="modal-box__title-row">
            <Sparkles size={18} color="var(--accent-400)" aria-hidden="true" />
            <h2 id="recovery-modal-title" className="modal-box__title">
              What happened?
            </h2>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onClose}
            aria-label="Close recovery modal"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {!response ? (
          <>
            <p id="recovery-modal-desc" className="modal-box__subtitle">
              Your feedback helps shape supportive suggestions. There are no judgments or streak penalties here.
            </p>

            {loading ? (
              <div className="recovery-loading" role="status" aria-live="polite">
                <Loader2 size={24} className="spin" color="var(--accent-400)" />
                <p>Generating supportive suggestions...</p>
              </div>
            ) : (
              <div className="recovery-reasons" role="radiogroup" aria-label="Reason for needing focus recovery">
                {REASON_OPTIONS.map((opt) => {
                  const isSelected = selectedReason === opt.id;
                  return (
                    <button
                      key={opt.id}
                      id={`recovery-reason-${opt.id}`}
                      className={`recovery-reason-btn${isSelected ? " recovery-reason-btn--selected" : ""}`}
                      onClick={() => handleSelectAndSubmit(opt.id)}
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${opt.label}. ${opt.description}`}
                    >
                      <span className="recovery-reason-btn__emoji" aria-hidden="true">
                        {opt.emoji}
                      </span>
                      <div className="recovery-reason-btn__content">
                        <span className="recovery-reason-btn__label">{opt.label}</span>
                        <span className="recovery-reason-btn__desc">{opt.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="recovery-error" role="alert">
                <AlertTriangle size={15} color="var(--color-distracted)" />
                <span>{error}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void handleSubmit()}
                  aria-label="Retry recovery request"
                >
                  <RotateCcw size={13} />
                  Retry
                </button>
              </div>
            )}

            <div className="modal-box__footer">
              <button
                className="btn btn-ghost"
                onClick={onClose}
                aria-label="Cancel and return to session"
              >
                Return to Session
              </button>
            </div>
          </>
        ) : (
          <div className="recovery-response fade-in" role="region" aria-label="Supportive Recovery Advice">
            <div className="recovery-response__card">
              <p className="recovery-response__message">{response.supportiveMessage}</p>

              {response.actionPayload?.suggestedNextAction && (
                <div className="recovery-response__action-box">
                  <span className="section-title">Immediate Concrete Step</span>
                  <p className="recovery-response__step-text">
                    {response.actionPayload.suggestedNextAction}
                  </p>
                </div>
              )}
            </div>

            {/* Actionable choices based on AI recommendation */}
            <div className="recovery-response__actions">
              {response.recommendation === "take_break" && onTakeBreak && (
                <button
                  id="recovery-action-break"
                  className="btn btn-primary"
                  onClick={() => {
                    const minutes = response.actionPayload?.suggestedBreakMinutes ?? 5;
                    onClose();
                    onTakeBreak(minutes);
                  }}
                  aria-label="Start mindful break"
                >
                  <Coffee size={15} />
                  Take a {response.actionPayload?.suggestedBreakMinutes ?? 5}-Minute Break
                </button>
              )}

              {response.recommendation === "simplify_task" && onDecomposeTask && (
                <button
                  id="recovery-action-decompose"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onDecomposeTask();
                  }}
                  aria-label="Break down task into smaller steps"
                >
                  <Scissors size={15} />
                  Break Down This Task
                </button>
              )}

              <button
                id="recovery-action-resume"
                className="btn btn-secondary"
                onClick={() => {
                  onClose();
                  onResumeTask?.();
                }}
                aria-label="Resume focus on current task"
              >
                <ArrowLeft size={15} />
                I&apos;m Ready to Refocus
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
