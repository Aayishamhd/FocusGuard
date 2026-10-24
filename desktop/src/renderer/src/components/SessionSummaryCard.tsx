import React from "react";
import { CheckCircle2, Clock, Pause, RefreshCw, ListChecks, Play } from "lucide-react";
import type { FocusSession } from "../types/app";
import { formatDurationHuman } from "../services/sessionTimer";

interface Props {
  session: FocusSession;
  onStartNewSession: () => void;
}

export function SessionSummaryCard({
  session,
  onStartNewSession,
}: Props): JSX.Element {
  const completedSubtasks = session.subtasks.filter((s) => s.completed).length;
  const totalSubtasks = session.subtasks.length;

  return (
    <section className="card session-summary-card fade-in" aria-label="Completed session summary">
      <div className="session-summary-card__header">
        <div className="session-summary-card__icon">
          <CheckCircle2 size={28} color="var(--color-focused)" />
        </div>
        <div>
          <span className="section-title">Session Concluded</span>
          <h2 className="session-summary-card__task-title">{session.task}</h2>
        </div>
      </div>

      <div className="session-summary-card__metrics">
        {/* Active Focus Time */}
        <div className="metric-box">
          <div className="metric-box__icon">
            <Clock size={16} color="var(--accent-400)" />
          </div>
          <div className="metric-box__content">
            <span className="metric-box__value">
              {formatDurationHuman(session.totalFocusSeconds)}
            </span>
            <span className="metric-box__label">Active Focus</span>
          </div>
        </div>

        {/* Total Pauses */}
        <div className="metric-box">
          <div className="metric-box__icon">
            <Pause size={16} color="var(--color-drifting)" />
          </div>
          <div className="metric-box__content">
            <span className="metric-box__value">{session.pauseCount}</span>
            <span className="metric-box__label">
              {session.pauseCount === 1 ? "Pause" : "Pauses"}
            </span>
          </div>
        </div>

        {/* Refocus Recoveries */}
        <div className="metric-box">
          <div className="metric-box__icon">
            <RefreshCw size={16} color="var(--color-recovering)" />
          </div>
          <div className="metric-box__content">
            <span className="metric-box__value">{session.recoveryCount}</span>
            <span className="metric-box__label">
              {session.recoveryCount === 1 ? "Recovery" : "Recoveries"}
            </span>
          </div>
        </div>

        {/* Completed Steps */}
        {totalSubtasks > 0 && (
          <div className="metric-box">
            <div className="metric-box__icon">
              <ListChecks size={16} color="var(--color-focused)" />
            </div>
            <div className="metric-box__content">
              <span className="metric-box__value">
                {completedSubtasks}/{totalSubtasks}
              </span>
              <span className="metric-box__label">Steps Done</span>
            </div>
          </div>
        )}
      </div>

      <div className="session-summary-card__actions">
        <button
          id="btn-start-new-session"
          className="btn btn-primary"
          onClick={onStartNewSession}
          aria-label="Start a new focus session"
        >
          <Play size={16} />
          Start New Focus Session
        </button>
      </div>
    </section>
  );
}
