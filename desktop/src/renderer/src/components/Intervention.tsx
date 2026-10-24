import React, { useState, useEffect } from "react";
import {
  X,
  ArrowLeft,
  Scissors,
  Coffee,
  Check,
  Compass,
  Sparkles,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import type { InterventionDecision, InterventionLevel } from "../types/contracts";

interface Props {
  decision: InterventionDecision;
  onAction: (actionId: string) => void;
  onDismiss: () => void;
  autoDismissSeconds?: number;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  return_to_task: <ArrowLeft size={14} aria-hidden="true" />,
  break_down_task: <Scissors size={14} aria-hidden="true" />,
  take_break: <Coffee size={14} aria-hidden="true" />,
  dismiss: <Check size={14} aria-hidden="true" />,
};

interface LevelMeta {
  title: string;
  badgeCls: string;
  icon: JSX.Element;
}

function getLevelMeta(level: InterventionLevel): LevelMeta {
  switch (level) {
    case "LEVEL_1_GENTLE_REMINDER":
      return {
        title: "Gentle Reminder",
        badgeCls: "intervention-badge--level-1",
        icon: <Sparkles size={14} color="var(--accent-400)" aria-hidden="true" />,
      };
    case "LEVEL_2_RECOVERY_SUGGESTION":
      return {
        title: "Focus Recovery",
        badgeCls: "intervention-badge--level-2",
        icon: <RefreshCw size={14} color="var(--color-drifting)" aria-hidden="true" />,
      };
    case "LEVEL_3_ASSISTANCE":
      return {
        title: "Need a Hand?",
        badgeCls: "intervention-badge--level-3",
        icon: <HelpCircle size={14} color="var(--color-recovering)" aria-hidden="true" />,
      };
    case "LEVEL_4_BREAK_SUGGESTION":
      return {
        title: "Time for a Break",
        badgeCls: "intervention-badge--level-4",
        icon: <Coffee size={14} color="var(--color-focused)" aria-hidden="true" />,
      };
    default:
      return {
        title: "Focus Notice",
        badgeCls: "intervention-badge--level-1",
        icon: <Compass size={14} color="var(--text-muted)" aria-hidden="true" />,
      };
  }
}

export function InterventionToast({
  decision,
  onAction,
  onDismiss,
  autoDismissSeconds = 18,
}: Props): JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);

  const meta = getLevelMeta(decision.level);

  // Auto-dismiss countdown bar that pauses on hover
  useEffect(() => {
    if (isHovered) return;

    const intervalMs = 100;
    const decrement = (intervalMs / (autoDismissSeconds * 1000)) * 100;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev <= decrement) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return prev - decrement;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isHovered, autoDismissSeconds, onDismiss]);

  return (
    <div
      className={`intervention-toast intervention-toast--${decision.level.toLowerCase()} slide-in-right`}
      role="alertdialog"
      aria-labelledby="intervention-title"
      aria-describedby="intervention-msg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Auto-dismiss progress bar */}
      <div className="intervention-toast__progressbar" aria-hidden="true">
        <div
          className="intervention-toast__progressbar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="intervention-toast__header">
        <div className={`intervention-toast__level-badge ${meta.badgeCls}`}>
          {meta.icon}
          <span id="intervention-title">{meta.title}</span>
        </div>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {decision.message && (
        <p id="intervention-msg" className="intervention-toast__message">
          {decision.message}
        </p>
      )}

      {decision.actions && decision.actions.length > 0 && (
        <div className="intervention-toast__actions">
          {decision.actions.map((action) => {
            const isDismiss = action.actionId === "dismiss";
            return (
              <button
                key={action.actionId}
                id={`intervention-action-${action.actionId}`}
                className={`btn btn-sm ${isDismiss ? "btn-ghost" : "btn-secondary"}`}
                onClick={() => {
                  onAction(action.actionId);
                  onDismiss();
                }}
              >
                {ACTION_ICONS[action.actionId]}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
