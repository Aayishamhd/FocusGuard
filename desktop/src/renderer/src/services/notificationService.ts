/**
 * FocusGuard Native Desktop Notification Service (Renderer)
 *
 * Dispatches gentle, non-punitive focus companion notifications through Electron IPC.
 * Respects user preferences (suppressed when notificationsEnabled is false).
 * Enforces calm, supportive wording across all notification categories.
 */

import { storageService } from "./storageService";

export type NotificationType =
  | "reminder"
  | "distraction"
  | "recovery"
  | "stuck"
  | "break"
  | "session_start"
  | "session_end"
  | "general";

export interface NotificationPayload {
  title: string;
  body: string;
  type: NotificationType;
  silent?: boolean;
  force?: boolean;
}

export class NotificationService {
  /**
   * Internal dispatcher that verifies preferences and sends through Electron IPC.
   */
  public async dispatchNotification(payload: NotificationPayload): Promise<{ sent: boolean; reason?: string }> {
    try {
      // 1. Verify user notification preference
      const prefs = await storageService.getPreferences();
      if (!prefs.notificationsEnabled) {
        return { sent: false, reason: "Notifications disabled in user settings" };
      }

      // 2. Dispatch through Electron native IPC if available
      if (typeof window !== "undefined" && window.focusGuard?.showNotification) {
        return await window.focusGuard.showNotification(payload);
      }

      // 3. Fallback for Web/Test environment (e.g., standard Notification API or mock)
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(payload.title, { body: payload.body });
          return { sent: true };
        }
      }

      return { sent: false, reason: "No native notification bridge available" };
    } catch (err) {
      console.warn("[NotificationService] Dispatch error:", err);
      return { sent: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 1. Focus Reminder (Gentle nudge)
   */
  public async notifyFocusReminder(goal?: string, force = false): Promise<{ sent: boolean; reason?: string }> {
    return this.dispatchNotification({
      title: "FocusGuard — Gentle Reminder",
      body: goal
        ? `You're working toward: "${goal}". Ready to refocus?`
        : "You're working toward your current goal. Ready to refocus?",
      type: "reminder",
      force,
    });
  }

  /**
   * 2. Distraction Detected (Attention drift)
   */
  public async notifyDistraction(goal?: string, force = false): Promise<{ sent: boolean; reason?: string }> {
    return this.dispatchNotification({
      title: "FocusGuard — Attention Drift",
      body: "It looks like your attention may have drifted. Want to return to your focus goal?",
      type: "distraction",
      force,
    });
  }

  /**
   * 3. Recovery Suggestion
   */
  public async notifyRecovery(goal?: string, force = false): Promise<{ sent: boolean; reason?: string }> {
    return this.dispatchNotification({
      title: "FocusGuard — Let's Get Back on Track",
      body: "Take a moment, reset, and continue with your current step.",
      type: "recovery",
      force,
    });
  }

  /**
   * 4. Stuck / AI Assistance
   */
  public async notifyStuckHelp(aiMessage?: string, force = false): Promise<{ sent: boolean; reason?: string }> {
    return this.dispatchNotification({
      title: "FocusGuard — Need a Hand?",
      body: aiMessage || "You may be stuck on this step. FocusGuard can help you break it down.",
      type: "stuck",
      force,
    });
  }

  /**
   * 5. Break Suggestion
   */
  public async notifyBreakSuggestion(suggestedMinutes = 5, force = false): Promise<{ sent: boolean; reason?: string }> {
    return this.dispatchNotification({
      title: "FocusGuard — Time for a Break?",
      body: "You've been focusing for a while. A short break may help you reset.",
      type: "break",
      force,
    });
  }

  /**
   * 6. Session Started
   */
  public async notifySessionStarted(goal: string, force = false): Promise<{ sent: boolean; reason?: string }> {
    return this.dispatchNotification({
      title: "FocusGuard — Focus Session Started",
      body: "Your focus session has started. Let's make progress.",
      type: "session_start",
      silent: true,
      force,
    });
  }

  /**
   * 7. Session Completed
   */
  public async notifySessionCompleted(formattedDuration?: string, force = false): Promise<{ sent: boolean; reason?: string }> {
    const body = formattedDuration
      ? `Nice work. You completed a ${formattedDuration} focus session.`
      : "Nice work. Your focus session is complete.";

    return this.dispatchNotification({
      title: "FocusGuard — Session Complete",
      body,
      type: "session_end",
      force,
    });
  }
}

export const notificationService = new NotificationService();
