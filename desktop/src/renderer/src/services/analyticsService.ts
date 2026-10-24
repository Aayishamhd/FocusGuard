/**
 * Analytics & Insights Aggregator — pure, deterministic metrics calculation.
 *
 * Rules:
 * 1. Only show claims supported by actual records.
 * 2. Never fabricate values or productivity scores.
 * 3. Clearly separate measured data from supportive insights.
 * 4. Define focused vs. fragmented time precisely without counting pauses as focus.
 */

import type { StoredSessionRecord, StoredInterventionRecord } from "../types/app";

// ─── Interfaces ────────────────────────────────────────────────────────────

export interface DailyFocusTrend {
  date: string;          // YYYY-MM-DD
  dayLabel: string;      // "Mon", "Tue", etc.
  focusSeconds: number;
  focusMinutes: number;
  sessionCount: number;
  fragmentedSeconds: number;
}

export interface AnalyticsSummary {
  hasEnoughData: boolean;
  totalSessions: number;
  completedSessions: number;
  totalFocusSeconds: number;
  totalFocusMinutes: number;
  totalFocusHours: number;
  totalFragmentedSeconds: number;
  totalFragmentedMinutes: number;
  totalRecoveries: number;
  longestUninterruptedSeconds: number;
  longestUninterruptedMinutes: number;
  dailyTrends: DailyFocusTrend[];
  thisWeekFocusMinutes: number;
  lastWeekFocusMinutes: number;
  insights: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Analytics Aggregation ─────────────────────────────────────────────────

export function calculateAnalytics(
  sessions: StoredSessionRecord[],
  interventions: StoredInterventionRecord[] = []
): AnalyticsSummary {
  if (!sessions || sessions.length === 0) {
    return {
      hasEnoughData: false,
      totalSessions: 0,
      completedSessions: 0,
      totalFocusSeconds: 0,
      totalFocusMinutes: 0,
      totalFocusHours: 0,
      totalFragmentedSeconds: 0,
      totalFragmentedMinutes: 0,
      totalRecoveries: 0,
      longestUninterruptedSeconds: 0,
      longestUninterruptedMinutes: 0,
      dailyTrends: generateEmptyDailyTrends(7),
      thisWeekFocusMinutes: 0,
      lastWeekFocusMinutes: 0,
      insights: [],
    };
  }

  let totalFocusSeconds = 0;
  let totalFragmentedSeconds = 0;
  let completedSessions = 0;
  let totalRecoveries = 0;
  let maxUninterrupted = 0;
  let maxAnyFocus = 0;

  sessions.forEach((s) => {
    const focusSec = Math.max(0, s.totalFocusSeconds || 0);
    const pausedSec = Math.max(0, s.totalPausedSeconds || 0);
    const recoveries = Math.max(0, s.recoveryCount || 0);

    totalFocusSeconds += focusSec;
    // Fragmented time = deliberate pause time + recovery transitions (estimated 60s per recovery)
    totalFragmentedSeconds += pausedSec + recoveries * 60;

    if (s.status === "completed") {
      completedSessions += 1;
    }

    totalRecoveries += recoveries;
    maxAnyFocus = Math.max(maxAnyFocus, focusSec);

    // Truly uninterrupted: zero pauses and zero recoveries
    if ((s.pauseCount || 0) === 0 && recoveries === 0) {
      maxUninterrupted = Math.max(maxUninterrupted, focusSec);
    }
  });

  const longestUninterruptedSeconds = maxUninterrupted > 0 ? maxUninterrupted : maxAnyFocus;

  // Calculate 7-day daily trends
  const dailyTrends = aggregateDailyTrends(sessions, 7);

  // Calculate weekly metrics
  const { thisWeekFocusMinutes, lastWeekFocusMinutes } = calculateWeeklyComparison(sessions);

  // Generate positive, transparent insights
  const insights = generateInsights({
    sessions,
    interventions,
    totalFocusSeconds,
    completedSessions,
    totalRecoveries,
    longestUninterruptedSeconds,
    dailyTrends,
  });

  const totalFocusMinutes = Math.round(totalFocusSeconds / 60);
  const totalFocusHours = parseFloat((totalFocusMinutes / 60).toFixed(1));
  const totalFragmentedMinutes = Math.round(totalFragmentedSeconds / 60);
  const longestUninterruptedMinutes = Math.round(longestUninterruptedSeconds / 60);

  return {
    hasEnoughData: sessions.length > 0 && totalFocusSeconds > 0,
    totalSessions: sessions.length,
    completedSessions,
    totalFocusSeconds,
    totalFocusMinutes,
    totalFocusHours,
    totalFragmentedSeconds,
    totalFragmentedMinutes,
    totalRecoveries,
    longestUninterruptedSeconds,
    longestUninterruptedMinutes,
    dailyTrends,
    thisWeekFocusMinutes,
    lastWeekFocusMinutes,
    insights,
  };
}

// ─── Trend & Weekly Helpers ────────────────────────────────────────────────

function generateEmptyDailyTrends(days: number): DailyFocusTrend[] {
  const trends: DailyFocusTrend[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    trends.push({
      date: toDateString(d),
      dayLabel: DAY_NAMES[d.getDay()],
      focusSeconds: 0,
      focusMinutes: 0,
      sessionCount: 0,
      fragmentedSeconds: 0,
    });
  }

  return trends;
}

function aggregateDailyTrends(sessions: StoredSessionRecord[], days: number): DailyFocusTrend[] {
  const trends = generateEmptyDailyTrends(days);
  const map = new Map<string, DailyFocusTrend>();
  trends.forEach((t) => map.set(t.date, t));

  sessions.forEach((s) => {
    const sessionDate = s.startTime ? s.startTime.split("T")[0] : toDateString(new Date(s.startedAt));
    const trend = map.get(sessionDate);
    if (trend) {
      trend.focusSeconds += s.totalFocusSeconds || 0;
      trend.focusMinutes = Math.round(trend.focusSeconds / 60);
      trend.sessionCount += 1;
      trend.fragmentedSeconds += (s.totalPausedSeconds || 0) + (s.recoveryCount || 0) * 60;
    }
  });

  return trends;
}

function calculateWeeklyComparison(sessions: StoredSessionRecord[]): {
  thisWeekFocusMinutes: number;
  lastWeekFocusMinutes: number;
} {
  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - 7);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  let thisWeekSec = 0;
  let lastWeekSec = 0;

  sessions.forEach((s) => {
    const time = new Date(s.startTime || s.startedAt).getTime();
    if (time >= startOfThisWeek.getTime()) {
      thisWeekSec += s.totalFocusSeconds || 0;
    } else if (time >= startOfLastWeek.getTime()) {
      lastWeekSec += s.totalFocusSeconds || 0;
    }
  });

  return {
    thisWeekFocusMinutes: Math.round(thisWeekSec / 60),
    lastWeekFocusMinutes: Math.round(lastWeekSec / 60),
  };
}

// ─── Human-Centered Insights ───────────────────────────────────────────────

interface InsightContext {
  sessions: StoredSessionRecord[];
  interventions: StoredInterventionRecord[];
  totalFocusSeconds: number;
  completedSessions: number;
  totalRecoveries: number;
  longestUninterruptedSeconds: number;
  dailyTrends: DailyFocusTrend[];
}

export function generateInsights(ctx: InsightContext): string[] {
  const insights: string[] = [];
  const { sessions, completedSessions, totalRecoveries, longestUninterruptedSeconds, dailyTrends } = ctx;

  if (sessions.length === 0) return insights;

  // 1. Longest uninterrupted session
  if (longestUninterruptedSeconds >= 60) {
    const minutes = Math.round(longestUninterruptedSeconds / 60);
    insights.push(`Your longest uninterrupted focus block was ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  // 2. Today's sessions
  const todayStr = toDateString(new Date());
  const todayTrend = dailyTrends.find((t) => t.date === todayStr);
  if (todayTrend && todayTrend.sessionCount > 0) {
    insights.push(
      `You completed ${todayTrend.sessionCount} focus session${todayTrend.sessionCount === 1 ? "" : "s"} today.`
    );
  } else if (completedSessions > 0) {
    insights.push(`You have completed ${completedSessions} intentional focus session${completedSessions === 1 ? "" : "s"} to date.`);
  }

  // 3. Recovery recognition (re-framing distraction as healthy self-correction)
  if (totalRecoveries > 0) {
    insights.push(
      `You successfully refocused ${totalRecoveries} time${totalRecoveries === 1 ? "" : "s"}. Attention drift is normal — self-correction is a real skill.`
    );
  }

  // 4. Multi-day consistency
  const activeDays = dailyTrends.filter((t) => t.sessionCount > 0).length;
  if (activeDays >= 3) {
    insights.push(`You engaged in focus sessions on ${activeDays} of the past 7 days. Consistency builds rhythm.`);
  }

  return insights;
}
