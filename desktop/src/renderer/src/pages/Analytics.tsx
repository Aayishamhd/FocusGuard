/**
 * Analytics Dashboard — displays real analytics derived from persisted records.
 *
 * Requirements:
 * - Total focused time (excluding paused intervals)
 * - Fragmented time (pauses and recovery transitions)
 * - Completed focus sessions count
 * - Recovery count
 * - Daily 7-day visual focus trends
 * - Weekly comparison (this week vs. last week)
 * - Longest uninterrupted session
 * - Positive, data-supported insights
 * - "Not enough data yet" empty states when records are insufficient
 * - Accessible labels, tooltips, and non-punitive framing
 */

import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart3,
  Clock,
  RefreshCw,
  Award,
  TrendingUp,
  Sparkles,
  Info,
  Calendar,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { storageService } from "../services/storageService";
import {
  calculateAnalytics,
  type AnalyticsSummary,
} from "../services/analyticsService";
import type { StoredSessionRecord, StoredInterventionRecord } from "../types/app";

function formatMinutes(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function Analytics(): JSX.Element {
  const { state } = useAppStore();
  const [sessions, setSessions] = useState<StoredSessionRecord[]>([]);
  const [interventions, setInterventions] = useState<StoredInterventionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load from local storage
  useEffect(() => {
    let mounted = true;
    Promise.all([storageService.getSessions(), storageService.getInterventions()])
      .then(([sess, ints]) => {
        if (!mounted) return;
        setSessions(sess);
        setInterventions(ints);
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn("[Analytics] Error loading history:", err);
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [state.sessionHistory]); // Re-fetch whenever sessionHistory updates

  // Calculate metrics
  const analytics: AnalyticsSummary = useMemo(() => {
    return calculateAnalytics(sessions, interventions);
  }, [sessions, interventions]);

  const maxDailyMinutes = useMemo(() => {
    const max = Math.max(...analytics.dailyTrends.map((d) => d.focusMinutes), 1);
    return max;
  }, [analytics.dailyTrends]);

  return (
    <div className="analytics fade-in" aria-label="Focus Analytics and Insights">
      {/* ── Page Header ── */}
      <div className="analytics__header">
        <div className="analytics__header-title">
          <BarChart3 size={24} color="var(--accent-400)" aria-hidden="true" />
          <h1>Analytics &amp; Self-Understanding</h1>
        </div>
        <p className="analytics__subtitle">
          Empathetic focus metrics derived from your locally stored sessions. Your wins, not your losses.
        </p>
      </div>

      {isLoading ? (
        <div className="card loading-indicator" style={{ padding: "40px", textAlign: "center" }}>
          <p className="text-muted">Loading your focus history...</p>
        </div>
      ) : !analytics.hasEnoughData ? (
        /* ── Empty State: Not Enough Data Yet ── */
        <div className="card empty-state" style={{ marginTop: "20px" }}>
          <div className="empty-state__icon-wrap">
            <BarChart3 size={48} color="var(--text-muted)" aria-hidden="true" />
          </div>
          <h2 className="empty-state__title">Not enough data yet</h2>
          <p className="empty-state__message">
            FocusGuard needs at least one completed focus session to calculate trends, longest focus blocks, and positive reflections.
          </p>
          <div className="empty-state__tip">
            <Sparkles size={16} color="var(--accent-400)" />
            <span>Head to the Dashboard and start a focus session to unlock your personalized insights.</span>
          </div>
        </div>
      ) : (
        <>
          {/* ── Key Metrics Cards ── */}
          <div className="analytics__grid">
            {/* Total Focused Time */}
            <div className="card stat-card stat-card--accent">
              <div className="stat-card__icon">
                <Clock size={20} color="var(--accent-400)" />
              </div>
              <div className="stat-card__label">Total Focused Time</div>
              <div className="stat-card__value">
                {analytics.totalFocusMinutes > 0 ? formatMinutes(analytics.totalFocusMinutes) : "Not enough data yet"}
              </div>
              <div className="stat-card__sub">
                Active on-task periods (pauses excluded)
              </div>
            </div>

            {/* Fragmented Time */}
            <div className="card stat-card">
              <div className="stat-card__icon">
                <RefreshCw size={20} color="var(--color-drifting)" />
              </div>
              <div className="stat-card__label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>Fragmented Time</span>
                <span
                  title="Time spent in deliberate pauses or recovery transitions during active sessions"
                  style={{ cursor: "help" }}
                >
                  <HelpCircle size={13} color="var(--text-muted)" />
                </span>
              </div>
              <div className="stat-card__value">
                {analytics.totalFragmentedMinutes > 0
                  ? formatMinutes(analytics.totalFragmentedMinutes)
                  : "0m"}
              </div>
              <div className="stat-card__sub">Paused &amp; recovery intervals</div>
            </div>

            {/* Completed Sessions */}
            <div className="card stat-card">
              <div className="stat-card__icon">
                <Award size={20} color="var(--color-focused)" />
              </div>
              <div className="stat-card__label">Completed Sessions</div>
              <div className="stat-card__value">{analytics.completedSessions}</div>
              <div className="stat-card__sub">
                {analytics.totalSessions > analytics.completedSessions
                  ? `${analytics.totalSessions} total started`
                  : "Intentional focus blocks"}
              </div>
            </div>

            {/* Recovery Count */}
            <div className="card stat-card">
              <div className="stat-card__icon">
                <TrendingUp size={20} color="var(--color-recovering)" />
              </div>
              <div className="stat-card__label">Focus Recoveries</div>
              <div className="stat-card__value">{analytics.totalRecoveries}</div>
              <div className="stat-card__sub">Times you successfully refocused</div>
            </div>
          </div>

          {/* ── Trend & Longest Session Row ── */}
          <div className="analytics__row-2col">
            {/* 7-Day Focus Trend Bar Chart */}
            <section className="card analytics__chart-card" aria-label="7-Day Focus Trend">
              <div className="analytics__section-header">
                <div className="analytics__section-title">
                  <Calendar size={18} color="var(--accent-400)" />
                  <span>Last 7 Days (Minutes of Focus)</span>
                </div>
                <span className="badge badge-subtle">
                  This week: {formatMinutes(analytics.thisWeekFocusMinutes)}
                </span>
              </div>

              <div
                className="analytics__bar-chart"
                role="img"
                aria-label={`Daily focus trend: ${analytics.dailyTrends.map((d) => `${d.dayLabel} ${d.focusMinutes}m`).join(", ")}`}
              >
                {analytics.dailyTrends.map((day) => {
                  const percent = Math.min(100, Math.round((day.focusMinutes / maxDailyMinutes) * 100));
                  return (
                    <div key={day.date} className="analytics__bar-col">
                      <div className="analytics__bar-track" title={`${day.date}: ${day.focusMinutes}m (${day.sessionCount} sessions)`}>
                        <div
                          className="analytics__bar-fill"
                          style={{
                            height: `${day.focusMinutes > 0 ? Math.max(8, percent) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="analytics__bar-label">{day.dayLabel}</span>
                      <span className="analytics__bar-val">{day.focusMinutes > 0 ? `${day.focusMinutes}m` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Longest Uninterrupted Session & Weekly Highlight */}
            <section className="card analytics__highlight-card" aria-label="Focus Highlights">
              <span className="section-title">Focus Highlights</span>

              <div className="analytics__highlight-item">
                <div className="analytics__highlight-icon">
                  <Sparkles size={18} color="var(--color-focused)" />
                </div>
                <div>
                  <div className="analytics__highlight-label">Longest Uninterrupted Session</div>
                  <div className="analytics__highlight-value">
                    {analytics.longestUninterruptedMinutes >= 1
                      ? `${analytics.longestUninterruptedMinutes} minutes`
                      : "Not enough data yet"}
                  </div>
                  <div className="analytics__highlight-note">
                    {analytics.longestUninterruptedMinutes >= 1
                      ? "Zero pauses or distractions recorded during this block."
                      : "Complete an uninterrupted block of 5+ minutes to record this metric."}
                  </div>
                </div>
              </div>

              <div className="divider" style={{ margin: "14px 0" }} />

              <div className="analytics__highlight-item">
                <div className="analytics__highlight-icon">
                  <TrendingUp size={18} color="var(--accent-400)" />
                </div>
                <div>
                  <div className="analytics__highlight-label">Weekly Trajectory</div>
                  <div className="analytics__highlight-value">
                    {analytics.thisWeekFocusMinutes >= analytics.lastWeekFocusMinutes && analytics.thisWeekFocusMinutes > 0
                      ? `+${analytics.thisWeekFocusMinutes - analytics.lastWeekFocusMinutes}m vs prior week`
                      : `${analytics.thisWeekFocusMinutes}m logged this week`}
                  </div>
                  <div className="analytics__highlight-note">
                    {analytics.lastWeekFocusMinutes > 0
                      ? `Last week: ${formatMinutes(analytics.lastWeekFocusMinutes)}`
                      : "Establishing your baseline rhythm."}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ── Positive Insights Section ── */}
          {analytics.insights.length > 0 && (
            <section className="card analytics__insights-card" aria-label="Positive Insights">
              <div className="analytics__section-header">
                <div className="analytics__section-title">
                  <Sparkles size={18} color="var(--color-focused)" />
                  <span>Positive Patterns &amp; Reflections</span>
                </div>
                <span className="badge badge-focused">Measured Data</span>
              </div>
              <ul className="analytics__insights-list">
                {analytics.insights.map((insight, idx) => (
                  <li key={idx} className="analytics__insight-bullet">
                    <span className="analytics__bullet-dot" />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Recent Stored Sessions List ── */}
          <section className="card analytics__history-card" aria-label="Session History">
            <div className="analytics__section-header">
              <span className="section-title">Stored Session History ({sessions.length})</span>
              <span className="badge badge-subtle">Stored Locally</span>
            </div>

            <div className="analytics__history-table-wrap">
              <table className="analytics__history-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Date</th>
                    <th>Focused</th>
                    <th>Paused</th>
                    <th>Recoveries</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 10).map((sess) => (
                    <tr key={sess.id}>
                      <td className="font-semibold" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sess.task}
                      </td>
                      <td className="text-muted">{formatDate(sess.startTime)}</td>
                      <td>{formatMinutes(Math.round(sess.totalFocusSeconds / 60))}</td>
                      <td className="text-muted">{sess.totalPausedSeconds ? `${Math.round(sess.totalPausedSeconds / 60)}m` : "0m"}</td>
                      <td>{sess.recoveryCount > 0 ? `🔄 ${sess.recoveryCount}` : "0"}</td>
                      <td>
                        <span className={`badge ${sess.status === "completed" ? "badge-focused" : "badge-subtle"}`}>
                          {sess.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Transparency & Privacy Guarantee ── */}
          <div className="analytics__privacy-note">
            <Info size={15} color="var(--text-muted)" />
            <span>
              <strong>Transparency Note:</strong> FocusGuard measures elapsed time and attention state transitions locally.
              Application activity is never equated to actual productivity, and your attention logs never leave this computer.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
