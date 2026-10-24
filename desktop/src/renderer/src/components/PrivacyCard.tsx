import React from "react";
import { ShieldCheck, VideoOff, Eye, Cpu } from "lucide-react";
import type { SessionStatus } from "../types/app";

interface Props {
  webcamEnabled: boolean;
  sessionStatus: SessionStatus;
  engineConnected: boolean;
}

export function PrivacyCard({
  webcamEnabled,
  sessionStatus,
  engineConnected,
}: Props): JSX.Element {
  const isMonitoring = sessionStatus === "running" || sessionStatus === "active";

  return (
    <div className="card privacy-card" aria-label="Privacy guarantee summary">
      <div className="privacy-card__header">
        <div className="privacy-card__title-row">
          <ShieldCheck size={18} color="var(--accent-400)" />
          <span className="privacy-card__title">Privacy & Local Processing</span>
        </div>
        <span className="badge badge-subtle">100% On-Device</span>
      </div>

      <div className="privacy-card__indicators">
        <div className="privacy-indicator">
          <div className="privacy-indicator__icon">
            <VideoOff size={15} color={webcamEnabled ? "var(--color-drifting)" : "var(--text-muted)"} />
          </div>
          <div className="privacy-indicator__info">
            <span className="privacy-indicator__label">Webcam Headpose</span>
            <span className="privacy-indicator__value">
              {webcamEnabled ? "Enabled (Local only)" : "Off (Default)"}
            </span>
          </div>
        </div>

        <div className="privacy-indicator">
          <div className="privacy-indicator__icon">
            <Cpu size={15} color={isMonitoring ? "var(--color-focused)" : "var(--text-muted)"} />
          </div>
          <div className="privacy-indicator__info">
            <span className="privacy-indicator__label">Attention Telemetry</span>
            <span className="privacy-indicator__value">
              {isMonitoring ? "Active (In-memory)" : "Idle"}
            </span>
          </div>
        </div>
      </div>

      <p className="privacy-card__guarantee">
        FocusGuard never stores or transmits webcam frames. All window title metrics and attention heuristics run locally on your machine.
      </p>
    </div>
  );
}
