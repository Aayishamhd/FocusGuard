import React, { useMemo } from "react";
import { Settings, Shield, Activity, PauseCircle, PlayCircle, CheckCircle } from "lucide-react";
import type { SessionStatus } from "../types/app";

interface Props {
  sessionStatus: SessionStatus;
  engineConnected: boolean;
  onOpenSettings: () => void;
}

export function DashboardHeader({
  sessionStatus,
  engineConnected,
  onOpenSettings,
}: Props): JSX.Element {
  const { greeting, formattedDate } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    let g = "Good morning";
    if (hour >= 12 && hour < 17) {
      g = "Good afternoon";
    } else if (hour >= 17) {
      g = "Good evening";
    }

    const d = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return { greeting: g, formattedDate: d };
  }, []);

  const isRunning = sessionStatus === "running" || sessionStatus === "active";
  const isPaused = sessionStatus === "paused";
  const isCompleted = sessionStatus === "completed" || sessionStatus === "ended";

  return (
    <header className="dashboard-header" aria-label="Dashboard overview">
      <div className="dashboard-header__left">
        <h1 className="dashboard-header__greeting">{greeting}</h1>
        <p className="dashboard-header__date">{formattedDate}</p>
      </div>

      <div className="dashboard-header__right">
        {/* Monitoring State Indicator */}
        <div
          className={`monitoring-pill ${
            isRunning
              ? "monitoring-pill--active"
              : isPaused
              ? "monitoring-pill--paused"
              : "monitoring-pill--idle"
          }`}
          role="status"
          aria-label={
            isRunning
              ? "Attention monitoring is currently active"
              : isPaused
              ? "Attention monitoring is paused"
              : "Attention monitoring is idle"
          }
        >
          <span
            className={`status-dot ${isRunning ? "online pulse" : isPaused ? "paused" : "offline"}`}
            aria-hidden="true"
          />
          <span className="monitoring-pill__text">
            {isRunning ? "Monitoring Active" : isPaused ? "Monitoring Paused" : "Monitoring Inactive"}
          </span>
        </div>

        {/* Session Status Tag */}
        <div className="session-status-tag" aria-label={`Session status: ${sessionStatus}`}>
          {isRunning && (
            <span className="tag tag-running">
              <PlayCircle size={13} aria-hidden="true" />
              Running
            </span>
          )}
          {isPaused && (
            <span className="tag tag-paused">
              <PauseCircle size={13} aria-hidden="true" />
              Paused
            </span>
          )}
          {isCompleted && (
            <span className="tag tag-completed">
              <CheckCircle size={13} aria-hidden="true" />
              Completed
            </span>
          )}
          {!isRunning && !isPaused && !isCompleted && (
            <span className="tag tag-idle">
              <Activity size={13} aria-hidden="true" />
              Idle
            </span>
          )}
        </div>

        {/* Settings Shortcut */}
        <button
          id="btn-settings-shortcut"
          className="btn btn-ghost btn-icon"
          onClick={onOpenSettings}
          title="Open Settings"
          aria-label="Open FocusGuard Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
