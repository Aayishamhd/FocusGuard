import React from "react";
import { Zap, Compass, EyeOff, RefreshCw, Clock } from "lucide-react";
import type { AttentionState } from "../types/contracts";

export interface AttentionStateInfo {
  label: string;
  description: string;
  cls: string;
  dotColor: string;
  icon: (props: { size?: number }) => JSX.Element;
}

export const ATTENTION_CONFIG: Record<AttentionState, AttentionStateInfo> = {
  FOCUSED: {
    label: "Focused",
    description: "Consistent engagement detected with your designated focal task.",
    cls: "badge-focused",
    dotColor: "var(--color-focused)",
    icon: ({ size = 13 }) => <Zap size={size} aria-hidden="true" />,
  },
  POSSIBLY_DRIFTING: {
    label: "Possibly Drifting",
    description: "Activity patterns suggest attention may be shifting away from primary work.",
    cls: "badge-drifting",
    dotColor: "var(--color-drifting)",
    icon: ({ size = 13 }) => <Compass size={size} aria-hidden="true" />,
  },
  DISTRACTED: {
    label: "Distracted",
    description: "Extended off-task or non-productive window activity detected.",
    cls: "badge-distracted",
    dotColor: "var(--color-distracted)",
    icon: ({ size = 13 }) => <EyeOff size={size} aria-hidden="true" />,
  },
  RECOVERING: {
    label: "Recovering",
    description: "Attention shifting back toward the primary workspace.",
    cls: "badge-recovering",
    dotColor: "var(--color-recovering)",
    icon: ({ size = 13 }) => <RefreshCw size={size} aria-hidden="true" />,
  },
  IDLE: {
    label: "Idle",
    description: "Monitoring waiting for an active focus session to begin.",
    cls: "badge-idle",
    dotColor: "var(--color-idle)",
    icon: ({ size = 13 }) => <Clock size={size} aria-hidden="true" />,
  },
};

interface Props {
  state: AttentionState;
  confidence?: number;
  showDescription?: boolean;
}

export function AttentionBadge({
  state,
  confidence,
  showDescription = false,
}: Props): JSX.Element {
  const config = ATTENTION_CONFIG[state] ?? ATTENTION_CONFIG.IDLE;
  const IconComponent = config.icon;

  return (
    <div className="attention-badge-container">
      <span
        className={`badge ${config.cls} attention-badge`}
        role="status"
        aria-label={`Attention status: ${config.label}. ${config.description}`}
        title={config.description}
      >
        <span className="attention-badge__icon">
          <IconComponent size={13} />
        </span>
        <span className="attention-badge__label">{config.label}</span>
        {confidence !== undefined && (
          <span className="attention-badge__confidence" aria-label={`Confidence: ${Math.round(confidence * 100)}%`}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </span>
      {showDescription && (
        <p className="attention-badge__description" aria-live="polite">
          {config.description}
        </p>
      )}
    </div>
  );
}
