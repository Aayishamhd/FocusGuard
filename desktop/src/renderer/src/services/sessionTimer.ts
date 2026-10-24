/**
 * FocusGuard Session Timer & Accuracy Service
 *
 * Implements timestamp-based elapsed time calculations to guarantee accuracy
 * even if the window is hidden, throttled, or paused.
 */

import { useState, useEffect } from "react";
import type { FocusSession } from "../types/app";

export const MAX_TASK_LENGTH = 120;

/**
 * Calculates accurate active elapsed seconds from session timestamps.
 * Excludes all paused durations. Pure and testable.
 */
export function calculateActiveElapsedSeconds(
  session: Pick<FocusSession, "startedAt" | "pausedAt" | "totalPausedMs" | "status" | "totalFocusSeconds">,
  now: number = Date.now()
): number {
  if (session.status === "idle") return 0;

  // Completed or ended sessions use their immutable recorded total
  if (session.status === "completed" || session.status === "ended") {
    return session.totalFocusSeconds;
  }

  // When paused, freeze at pausedAt timestamp
  if (session.status === "paused") {
    if (session.pausedAt !== null) {
      const activeMs = session.pausedAt - session.startedAt - session.totalPausedMs;
      return Math.max(0, Math.floor(activeMs / 1000));
    }
    return session.totalFocusSeconds;
  }

  // When running or active, calculate up to now
  const activeMs = now - session.startedAt - session.totalPausedMs;
  return Math.max(0, Math.floor(activeMs / 1000));
}

/**
 * Formats a duration in seconds to standard HH:MM:SS or MM:SS display.
 */
export function formatTimerDisplay(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Formats seconds into human-readable text for summaries (e.g. "45m 12s" or "1h 15m").
 */
export function formatDurationHuman(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Validates task description according to dashboard rules:
 * - Non-empty after trimming
 * - Maximum 120 characters
 */
export function validateTaskInput(task: string): { valid: boolean; error?: string; trimmed: string } {
  const trimmed = task.trim();
  if (!trimmed) {
    return { valid: false, error: "Task description cannot be blank. Please enter a focus goal.", trimmed: "" };
  }
  if (trimmed.length > MAX_TASK_LENGTH) {
    return {
      valid: false,
      error: `Task description is too long (${trimmed.length}/${MAX_TASK_LENGTH} characters). Keep it concise and actionable.`,
      trimmed,
    };
  }
  return { valid: true, trimmed };
}

/**
 * React hook that yields real-time elapsed focus seconds and formatted text.
 * Driven by timestamp calculation, unaffected by background tab throttle.
 */
export function useSessionTimer(session: FocusSession | null): {
  elapsedSeconds: number;
  formattedTime: string;
} {
  const isRunning = session?.status === "running" || session?.status === "active";
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;

    // Tick twice per second for smooth, responsive UI
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => clearInterval(interval);
  }, [isRunning]);

  if (!session || session.status === "idle") {
    return { elapsedSeconds: 0, formattedTime: "00:00" };
  }

  const elapsed = calculateActiveElapsedSeconds(session, now);
  return {
    elapsedSeconds: elapsed,
    formattedTime: formatTimerDisplay(elapsed),
  };
}
