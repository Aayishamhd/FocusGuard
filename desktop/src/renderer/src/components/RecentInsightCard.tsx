import React from "react";
import { Sparkles, Compass } from "lucide-react";
import type { SessionInsight } from "../types/app";

interface Props {
  insight: SessionInsight | null;
}

export function RecentInsightCard({ insight }: Props): JSX.Element {
  if (!insight) {
    return (
      <div className="card insight-card insight-card--empty" aria-label="Focus insight">
        <div className="insight-card__icon insight-card__icon--idle">
          <Compass size={20} color="var(--text-muted)" />
        </div>
        <div className="insight-card__body">
          <span className="section-title">Focus Insights</span>
          <p className="insight-card__empty-text">
            Complete your first session to unlock personalized, non-judgmental attention patterns and recovery metrics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card insight-card fade-in" aria-label="Recent focus insight">
      <div className="insight-card__icon insight-card__icon--positive">
        <Sparkles size={20} color="var(--color-focused)" />
      </div>
      <div className="insight-card__body">
        <div className="insight-card__top">
          <span className="section-title">Recent Session Reflection</span>
          {insight.metricText && (
            <span className="badge badge-focused">{insight.metricText}</span>
          )}
        </div>
        <p className="insight-card__message">{insight.message}</p>
      </div>
    </div>
  );
}
