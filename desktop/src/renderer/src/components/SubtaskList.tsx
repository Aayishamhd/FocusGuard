import React from "react";
import { CheckCircle2, Circle, ChevronRight, Clock, Sparkles } from "lucide-react";
import type { SubTaskItem } from "../types/app";

interface Props {
  subtasks: SubTaskItem[];
  activeSubtaskId: string | null;
  onToggle: (id: string) => void;
  onSelectActive: (id: string) => void;
  onRequestBreakdown?: () => void;
  loading?: boolean;
}

export function SubtaskList({
  subtasks,
  activeSubtaskId,
  onToggle,
  onSelectActive,
  onRequestBreakdown,
  loading = false,
}: Props): JSX.Element {
  if (subtasks.length === 0) {
    return (
      <div className="subtask-empty">
        <div className="subtask-empty__icon">
          <Sparkles size={24} color="var(--accent-400)" />
        </div>
        <p className="subtask-empty__title">No subtasks yet</p>
        <p className="subtask-empty__message">
          Break this session into manageable 10–20 minute focus checkpoints.
        </p>
        {onRequestBreakdown && (
          <button
            id="btn-breakdown-subtasks"
            className="btn btn-secondary btn-sm"
            onClick={onRequestBreakdown}
            disabled={loading}
            aria-label="Generate AI subtasks"
          >
            <Sparkles size={14} />
            {loading ? "Generating steps..." : "Break Down with AI"}
          </button>
        )}
      </div>
    );
  }

  const completedCount = subtasks.filter((s) => s.completed).length;
  const totalCount = subtasks.length;
  const percentComplete = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="subtasks-container">
      {/* Progress header */}
      <div className="subtasks-header">
        <div className="subtasks-header__stats">
          <span className="subtasks-header__title">Action Checklist</span>
          <span className="subtasks-header__count" aria-live="polite">
            {completedCount} of {totalCount} completed ({percentComplete}%)
          </span>
        </div>
        <div
          className="subtasks-progressbar"
          role="progressbar"
          aria-valuenow={percentComplete}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Subtasks progress: ${percentComplete}% completed`}
        >
          <div
            className="subtasks-progressbar__fill"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      </div>

      {/* Task list */}
      <ol className="subtask-list" aria-label="Focus session subtasks">
        {subtasks.map((task, index) => {
          const isActive = task.id === activeSubtaskId;
          const isCompleted = task.completed;

          return (
            <li
              key={task.id}
              className={`subtask-item${isActive ? " subtask-item--active" : ""}${isCompleted ? " subtask-item--done" : ""}`}
              aria-current={isActive ? "step" : undefined}
            >
              {/* Checkbox */}
              <button
                type="button"
                className="subtask-item__check"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(task.id);
                }}
                aria-label={
                  isCompleted
                    ? `Mark step ${task.stepNumber}: ${task.title} as incomplete`
                    : `Mark step ${task.stepNumber}: ${task.title} as completed`
                }
                title={isCompleted ? "Mark incomplete" : "Mark complete"}
              >
                {isCompleted ? (
                  <CheckCircle2 size={18} color="var(--color-focused)" aria-hidden="true" />
                ) : (
                  <Circle
                    size={18}
                    color={isActive ? "var(--accent-400)" : "var(--text-muted)"}
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* Clickable body to set as active step */}
              <div
                className="subtask-item__body"
                onClick={() => {
                  if (!isCompleted) {
                    onSelectActive(task.id);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!isCompleted) onSelectActive(task.id);
                  }
                }}
                aria-label={`Step ${task.stepNumber}: ${task.title}. ${task.estimatedMinutes} minutes estimated.${isActive ? " Current active step." : " Click to set as active step."}`}
              >
                <div className="subtask-item__title-row">
                  <span className="subtask-item__step-number">Step {task.stepNumber || index + 1}</span>
                  <span className="subtask-item__title">{task.title}</span>
                </div>
                {task.description && (
                  <p className="subtask-item__desc">{task.description}</p>
                )}
              </div>

              {/* Meta information & active badge */}
              <div className="subtask-item__meta">
                <span className="subtask-item__time" title="Estimated duration">
                  <Clock size={12} aria-hidden="true" />
                  {task.estimatedMinutes}m
                </span>
                {isActive && (
                  <span className="subtask-item__active-badge" title="Current active focus step">
                    Active
                    <ChevronRight size={12} aria-hidden="true" />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
