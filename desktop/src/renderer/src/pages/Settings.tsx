/**
 * Settings and Privacy Center
 *
 * Requirements:
 * - Webcam enabled/disabled preference (defaults to off)
 * - Notifications enabled/disabled
 * - Pause/resume monitoring with engine coordination and clear error handling
 * - Intervention preferences (frequency/style)
 * - "Clear All Stored History" with explicit confirmation modal
 * - Explains what will be deleted, clears dependent analytics state, preserves preferences by default
 * - Never deletes files outside the designated data store
 * - Displays storage statistics (session count, intervention count, storage directory)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings as SettingsIcon,
  Eye,
  Bell,
  Trash2,
  Info,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  Sliders,
  HardDrive,
  AlertTriangle,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { getEngineService, isUsingMocks } from "../services/serviceManager";
import { storageService, type StorageStats } from "../services/storageService";

export function Settings(): JSX.Element {
  const { state, dispatch, clearHistory } = useAppStore();
  const { preferences } = state;
  const mockMode = isUsingMocks();

  // Storage stats
  const [stats, setStats] = useState<StorageStats | null>(null);

  // Engine monitoring state & feedback
  const [isEnginePaused, setIsEnginePaused] = useState(Boolean(preferences.monitoringPaused));
  const [engineFeedback, setEngineFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [isUpdatingEngine, setIsUpdatingEngine] = useState(false);

  // Confirmation modal for clearing history
  const [showClearModal, setShowClearModal] = useState(false);
  const [resetPreferencesAlso, setResetPreferencesAlso] = useState(false);
  const [clearStatus, setClearStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // Load storage stats
  const refreshStats = useCallback(async () => {
    try {
      const data = await storageService.getStorageStats();
      setStats(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  // ─── Preference Toggles ───────────────────────────────────────────────────

  const handleToggleWebcam = async () => {
    const nextVal = !preferences.webcamEnabled;
    dispatch({
      type: "SET_PREFERENCES",
      preferences: { webcamEnabled: nextVal },
    });
  };

  const handleToggleNotifications = async () => {
    const nextVal = !preferences.notificationsEnabled;
    dispatch({
      type: "SET_PREFERENCES",
      preferences: { notificationsEnabled: nextVal },
    });
  };

  const handleChangeInterventionStyle = (style: "gentle" | "standard" | "minimal") => {
    dispatch({
      type: "SET_PREFERENCES",
      preferences: { interventionStyle: style },
    });
  };

  // ─── Monitoring Pause / Resume Coordination ───────────────────────────────

  const handleToggleMonitoring = async () => {
    setIsUpdatingEngine(true);
    setEngineFeedback(null);
    const engine = getEngineService();

    try {
      if (isEnginePaused) {
        await engine.startMonitoring();
        setIsEnginePaused(false);
        dispatch({
          type: "SET_PREFERENCES",
          preferences: { monitoringPaused: false },
        });
        setEngineFeedback({ message: "Engine monitoring resumed successfully.", isError: false });
      } else {
        await engine.pauseMonitoring();
        setIsEnginePaused(true);
        dispatch({
          type: "SET_PREFERENCES",
          preferences: { monitoringPaused: true },
        });
        setEngineFeedback({ message: "Engine monitoring paused.", isError: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Engine service could not be reached.";
      setEngineFeedback({
        message: `Unable to coordinate with Engine service: ${msg}. Make sure Feature 1 is running on port 5001 or use Mock Mode.`,
        isError: true,
      });
    } finally {
      setIsUpdatingEngine(false);
    }
  };

  // ─── Clear All History Handler ────────────────────────────────────────────

  const handleConfirmClearHistory = async () => {
    setIsClearing(true);
    setClearStatus(null);

    try {
      const res = await storageService.clearHistory({ resetPreferences: resetPreferencesAlso });
      if (res.success) {
        dispatch({ type: "CLEAR_HISTORY", resetPreferences: resetPreferencesAlso });
        setClearStatus({
          success: true,
          message: `Successfully cleared ${res.clearedSessions} sessions and ${res.clearedInterventions} intervention events.`,
        });
        await refreshStats();
        setTimeout(() => {
          setShowClearModal(false);
          setClearStatus(null);
        }, 1800);
      } else {
        setClearStatus({
          success: false,
          message: "Failed to purge local history. Please check file permissions.",
        });
      }
    } catch (err) {
      setClearStatus({
        success: false,
        message: `Deletion failed: ${err instanceof Error ? err.message : "Unknown error"}. No files outside user data were affected.`,
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="settings fade-in" aria-label="Settings and Privacy Center">
      {/* ── Page Header ── */}
      <div className="settings__header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SettingsIcon size={24} color="var(--accent-400)" aria-hidden="true" />
          <h1 className="settings__title">Settings &amp; Privacy Center</h1>
        </div>
        <p className="settings__subtitle">
          Your data belongs to you. FocusGuard processes attention telemetry 100% on-device with zero cloud telemetry.
        </p>
      </div>

      {/* ── Service Mode Banner ── */}
      <div className={`card settings__mode-banner ${mockMode ? "settings__mode-banner--mock" : "settings__mode-banner--live"}`}>
        <Info size={16} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {mockMode ? "Running in Mock Mode (Offline Development)" : "Connected to Live Backends"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {mockMode
              ? "All attention shifts and AI suggestions are generated deterministically inside the sandbox."
              : "Connected to Attention Engine (port 5001) and Assistant (port 5002)."}
          </div>
        </div>
      </div>

      {/* ── Privacy & Webcam Section ── */}
      <section className="card settings__section" aria-labelledby="privacy-heading">
        <div className="settings__section-header">
          <ShieldCheck size={18} color="var(--accent-400)" />
          <h2 id="privacy-heading" className="section-title">Privacy Controls</h2>
        </div>

        {/* Webcam Monitoring */}
        <div className="settings__row">
          <div className="settings__row-info">
            <Eye size={18} color={preferences.webcamEnabled ? "var(--color-drifting)" : "var(--text-muted)"} />
            <div>
              <div className="settings__row-label">
                Webcam Head-Pose Engagement
                <span className="badge badge-subtle" style={{ marginLeft: 8 }}>
                  Defaults to Off
                </span>
              </div>
              <div className="settings__row-desc">
                Optional physical presence &amp; head-pose estimation. <strong>Zero webcam frames or video recordings are ever stored or transmitted.</strong>
              </div>
            </div>
          </div>
          <button
            id="toggle-webcam"
            className={`toggle${preferences.webcamEnabled ? " active" : ""}`}
            onClick={handleToggleWebcam}
            role="switch"
            aria-checked={preferences.webcamEnabled}
            aria-label="Toggle webcam engagement monitoring"
          />
        </div>

        {preferences.webcamEnabled && (
          <div className="settings__notice settings__notice--info" style={{ marginTop: 10 }}>
            <Info size={14} />
            <span>
              Webcam preference active. Head-pose estimation runs strictly on your local CPU/GPU via Feature 1.
            </span>
          </div>
        )}

        <div className="divider" />

        {/* Notifications */}
        <div className="settings__row">
          <div className="settings__row-info">
            <Bell size={18} color={preferences.notificationsEnabled ? "var(--color-focused)" : "var(--text-muted)"} />
            <div>
              <div className="settings__row-label">Gentle Interventions &amp; Notifications</div>
              <div className="settings__row-desc">
                Allow calm corner toasts when focus shifts or when a structured break is recommended.
              </div>
            </div>
          </div>
          <button
            id="toggle-notifications"
            className={`toggle${preferences.notificationsEnabled ? " active" : ""}`}
            onClick={handleToggleNotifications}
            role="switch"
            aria-checked={preferences.notificationsEnabled}
            aria-label="Toggle notifications"
          />
        </div>
      </section>

      {/* ── Monitoring Pause / Coordination Section ── */}
      <section className="card settings__section" aria-labelledby="monitoring-heading">
        <div className="settings__section-header">
          <Sliders size={18} color="var(--accent-400)" />
          <h2 id="monitoring-heading" className="section-title">Monitoring Controls</h2>
        </div>

        <div className="settings__row">
          <div className="settings__row-info">
            {isEnginePaused ? (
              <PauseCircle size={18} color="var(--color-drifting)" />
            ) : (
              <PlayCircle size={18} color="var(--color-focused)" />
            )}
            <div>
              <div className="settings__row-label">Background Attention Monitoring</div>
              <div className="settings__row-desc">
                {isEnginePaused
                  ? "Monitoring is currently paused. No active window tracking is being processed."
                  : "Active window tracker and engagement heuristics are running."}
              </div>
            </div>
          </div>
          <button
            id="toggle-pause-monitoring"
            className={`btn btn-sm ${isEnginePaused ? "btn-primary" : "btn-secondary"}`}
            onClick={handleToggleMonitoring}
            disabled={isUpdatingEngine}
            aria-label={isEnginePaused ? "Resume Monitoring" : "Pause Monitoring"}
          >
            {isUpdatingEngine ? (
              "Coordinating..."
            ) : isEnginePaused ? (
              <>
                <PlayCircle size={14} />
                <span>Resume Monitoring</span>
              </>
            ) : (
              <>
                <PauseCircle size={14} />
                <span>Pause Monitoring</span>
              </>
            )}
          </button>
        </div>

        {engineFeedback && (
          <div
            className={`settings__notice ${engineFeedback.isError ? "settings__notice--error" : "settings__notice--success"}`}
            role="status"
          >
            {engineFeedback.isError ? <AlertTriangle size={15} /> : <Check size={15} />}
            <span>{engineFeedback.message}</span>
          </div>
        )}

        <div className="divider" />

        {/* Intervention Style */}
        <div className="settings__row">
          <div className="settings__row-info">
            <Sliders size={18} color="var(--accent-400)" />
            <div>
              <div className="settings__row-label">Intervention Style</div>
              <div className="settings__row-desc">Customize the frequency and assertiveness of gentle recovery toasts</div>
            </div>
          </div>
          <div className="btn-group" role="radiogroup" aria-label="Intervention style">
            {(["gentle", "standard", "minimal"] as const).map((style) => (
              <button
                key={style}
                id={`intervention-style-${style}`}
                className={`btn btn-sm ${preferences.interventionStyle === style ? "btn-primary" : "btn-ghost"}`}
                onClick={() => handleChangeInterventionStyle(style)}
                role="radio"
                aria-checked={preferences.interventionStyle === style}
              >
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Local Data & Privacy Center ── */}
      <section className="card settings__section" aria-labelledby="data-heading">
        <div className="settings__section-header">
          <HardDrive size={18} color="var(--accent-400)" />
          <h2 id="data-heading" className="section-title">Local Data &amp; Storage</h2>
        </div>

        <div className="settings__storage-stats">
          <div className="settings__stat-box">
            <span className="settings__stat-box-val">{stats ? stats.sessionCount : state.sessionHistory.length}</span>
            <span className="settings__stat-box-lbl">Stored Sessions</span>
          </div>
          <div className="settings__stat-box">
            <span className="settings__stat-box-val">{stats ? stats.interventionCount : 0}</span>
            <span className="settings__stat-box-lbl">Intervention Records</span>
          </div>
          <div className="settings__stat-box">
            <span className="settings__stat-box-val">0 KB</span>
            <span className="settings__stat-box-lbl">Video Footage (Never Saved)</span>
          </div>
        </div>

        <div className="settings__storage-path">
          <span className="text-muted">Storage location:</span>
          <code className="font-mono">{stats?.storageDir || "Electron userData/focusguard"}</code>
        </div>

        <div className="divider" />

        {/* Clear All Stored History Button */}
        <div className="settings__row">
          <div className="settings__row-info">
            <Trash2 size={18} color="var(--color-distracted)" />
            <div>
              <div className="settings__row-label">Clear All Stored History</div>
              <div className="settings__row-desc">
                Permanently purge all session history, intervention records, and cached analytics. Preferences are preserved by default.
              </div>
            </div>
          </div>
          <button
            id="clear-all-data-btn"
            className="btn btn-danger btn-sm"
            onClick={() => setShowClearModal(true)}
            aria-label="Open Clear Stored History dialog"
          >
            <Trash2 size={14} />
            <span>Clear History...</span>
          </button>
        </div>
      </section>

      {/* ── Confirmation Modal: Clear History ── */}
      {showClearModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-history-title"
          onClick={() => !isClearing && setShowClearModal(false)}
        >
          <div
            className="modal modal--danger slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460 }}
          >
            <div className="modal__header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={20} color="var(--color-distracted)" />
                <h3 id="clear-history-title" className="modal__title">
                  Clear All Stored History?
                </h3>
              </div>
              <button
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal__body">
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                This action will permanently delete:
              </p>
              <ul style={{ margin: "10px 0 16px 20px", fontSize: 13, color: "var(--text-secondary)" }}>
                <li>All completed and abandoned focus session records</li>
                <li>All intervention events and recovery feedback logs</li>
                <li>All aggregated focus trend statistics</li>
              </ul>

              <div className="settings__checkbox-row" style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0" }}>
                <input
                  id="reset-prefs-checkbox"
                  type="checkbox"
                  checked={resetPreferencesAlso}
                  onChange={(e) => setResetPreferencesAlso(e.target.checked)}
                  disabled={isClearing}
                />
                <label htmlFor="reset-prefs-checkbox" style={{ fontSize: 13, cursor: "pointer" }}>
                  Also reset camera and notification preferences to defaults
                </label>
              </div>

              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <em>Safety guarantee:</em> Only files inside the FocusGuard user-data store will be purged. No external files will ever be touched.
              </p>

              {clearStatus && (
                <div
                  className={`settings__notice ${clearStatus.success ? "settings__notice--success" : "settings__notice--error"}`}
                  style={{ marginTop: 12 }}
                >
                  {clearStatus.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span>{clearStatus.message}</span>
                </div>
              )}
            </div>

            <div className="modal__actions">
              <button
                id="cancel-clear-btn"
                className="btn btn-ghost"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
              >
                Cancel
              </button>
              <button
                id="confirm-clear-history-btn"
                className="btn btn-danger"
                onClick={handleConfirmClearHistory}
                disabled={isClearing}
              >
                {isClearing ? "Purging..." : "Yes, Purge History"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── About FocusGuard ── */}
      <section className="card settings__section">
        <span className="section-title">About FocusGuard</span>
        <div className="settings__about">
          <div className="settings__about-row">
            <span className="text-muted">Version</span>
            <span>0.1.0 (Hackathon Edition)</span>
          </div>
          <div className="settings__about-row">
            <span className="text-muted">Engine Service</span>
            <span className="font-mono" style={{ fontSize: 12 }}>http://127.0.0.1:5001</span>
          </div>
          <div className="settings__about-row">
            <span className="text-muted">Assistant Service</span>
            <span className="font-mono" style={{ fontSize: 12 }}>http://127.0.0.1:5002</span>
          </div>
          <div className="settings__about-row">
            <span className="text-muted">Architecture</span>
            <span>Electron + React + Context Isolation</span>
          </div>
        </div>
      </section>
    </div>
  );
}
