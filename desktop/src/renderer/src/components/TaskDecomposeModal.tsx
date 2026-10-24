import React, { useState, useEffect, useRef } from "react";
import {
  Scissors,
  X,
  Loader2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  ChevronRight,
  ListPlus,
} from "lucide-react";
import { getAssistantService } from "../services/serviceManager";
import type { SubTask, TaskDecompositionResponse } from "../types/contracts";

interface Props {
  initialTask: string;
  onApplySubtasks: (subtasks: SubTask[]) => void;
  onClose: () => void;
}

export function TaskDecomposeModal({
  initialTask,
  onApplySubtasks,
  onClose,
}: Props): JSX.Element {
  const [taskText, setTaskText] = useState(initialTask);
  const [difficulty, setDifficulty] = useState<"quick" | "moderate" | "complex">("moderate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decompositionResult, setDecompositionResult] = useState<TaskDecompositionResponse | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // Preserve invoking focus
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

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
      previousActiveElementRef.current?.focus();
    };
  }, [onClose]);

  const handleDecompose = async () => {
    if (!taskText.trim()) {
      setError("Please specify a focus task description.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getAssistantService().decompose({
        taskDescription: taskText.trim(),
        difficultyLevel: difficulty,
      });

      if (!response.subtasks || response.subtasks.length === 0) {
        setError("The assistant did not return any steps for this task. Try adding more detail or retrying.");
        setDecompositionResult(null);
      } else {
        setDecompositionResult(response);
        setActiveStepIndex(0);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to break down task. Please check assistant connection and try again."
      );
      // Preserves taskText so user doesn't lose their input!
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!decompositionResult || decompositionResult.subtasks.length === 0) return;

    // Mark the selected active step
    const formatted = decompositionResult.subtasks.map((s, idx) => ({
      ...s,
      isImmediateNextStep: idx === activeStepIndex,
    }));

    onApplySubtasks(formatted);
    onClose();
  };

  return (
    <div
      className="modal-overlay fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decompose-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-box modal-box--decompose">
        <div className="modal-box__header">
          <div className="modal-box__title-row">
            <Scissors size={18} color="var(--accent-400)" aria-hidden="true" />
            <h2 id="decompose-modal-title" className="modal-box__title">
              Break Down Large Goal
            </h2>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onClose}
            aria-label="Close task breakdown modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Input Form */}
        <div className="decompose-form">
          <label htmlFor="decompose-task-input" className="section-title">
            What is the overarching goal?
          </label>
          <input
            id="decompose-task-input"
            className="input"
            type="text"
            value={taskText}
            onChange={(e) => {
              setTaskText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) void handleDecompose();
            }}
            placeholder="e.g. Prepare my quarterly engineering review presentation"
            disabled={loading}
          />

          <div className="decompose-controls-row">
            <div className="decompose-difficulty" role="radiogroup" aria-label="Breakdown Detail">
              <span className="decompose-difficulty__label">Detail Level:</span>
              <button
                type="button"
                className={`btn btn-sm ${difficulty === "quick" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setDifficulty("quick")}
                role="radio"
                aria-checked={difficulty === "quick"}
              >
                Quick (2 steps)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${difficulty === "moderate" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setDifficulty("moderate")}
                role="radio"
                aria-checked={difficulty === "moderate"}
              >
                Standard (4 steps)
              </button>
            </div>

            <button
              id="btn-run-decompose"
              className="btn btn-primary btn-sm"
              onClick={() => void handleDecompose()}
              disabled={loading || !taskText.trim()}
              aria-label="Generate subtasks"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="spin" />
                  Decomposing...
                </>
              ) : (
                <>
                  <Scissors size={14} />
                  Break Down with AI
                </>
              )}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="decompose-loading" role="status" aria-live="polite">
            <Loader2 size={24} className="spin" color="var(--accent-400)" />
            <p>Analyzing goal and identifying smallest immediate first step...</p>
          </div>
        )}

        {/* Error State with Retry Button */}
        {error && !loading && (
          <div className="decompose-error" role="alert">
            <div className="decompose-error__icon">
              <AlertTriangle size={16} color="var(--color-distracted)" />
            </div>
            <div className="decompose-error__body">
              <p className="decompose-error__text">{error}</p>
              <p className="decompose-error__hint">Your input has been preserved above.</p>
            </div>
            <button
              id="btn-retry-decompose"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleDecompose()}
              aria-label="Retry breakdown"
            >
              <RotateCcw size={13} />
              Retry
            </button>
          </div>
        )}

        {/* Generated Steps Preview */}
        {decompositionResult && !loading && (
          <div className="decompose-preview fade-in">
            <div className="decompose-preview__header">
              <span className="section-title">Suggested Action Sequence</span>
              <span className="decompose-preview__caption">
                Click any step to set it as your immediate starting point.
              </span>
            </div>

            <ol className="decompose-preview__list" aria-label="Suggested subtasks">
              {decompositionResult.subtasks.map((step, idx) => {
                const isSelectedActive = idx === activeStepIndex;
                return (
                  <li
                    key={step.stepNumber || idx}
                    className={`decompose-step-item${isSelectedActive ? " decompose-step-item--active" : ""}`}
                    onClick={() => setActiveStepIndex(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActiveStepIndex(idx);
                      }
                    }}
                    aria-label={`Step ${step.stepNumber}: ${step.title}. ${step.estimatedMinutes} minutes.${isSelectedActive ? " Selected as immediate next step." : " Click to select as start step."}`}
                  >
                    <div className="decompose-step-item__number">
                      {step.stepNumber || idx + 1}
                    </div>
                    <div className="decompose-step-item__content">
                      <div className="decompose-step-item__title-row">
                        <span className="decompose-step-item__title">{step.title}</span>
                        {isSelectedActive && (
                          <span className="badge badge-focused">
                            Immediate Next Step
                          </span>
                        )}
                      </div>
                      <p className="decompose-step-item__desc">{step.description}</p>
                    </div>
                    <div className="decompose-step-item__meta">
                      <span className="decompose-step-item__time">
                        <Clock size={12} />
                        {step.estimatedMinutes}m
                      </span>
                      <ChevronRight size={14} color={isSelectedActive ? "var(--color-focused)" : "var(--text-muted)"} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Footer Actions */}
        <div className="modal-box__footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {decompositionResult && decompositionResult.subtasks.length > 0 && (
            <button
              id="btn-apply-decompose"
              className="btn btn-primary"
              onClick={handleApply}
              aria-label="Apply generated subtasks to current session"
            >
              <ListPlus size={15} />
              Apply Steps to Focus Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
