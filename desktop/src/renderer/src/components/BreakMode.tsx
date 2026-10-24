import React, { useState, useEffect } from "react";
import { Coffee, Play, Pause, Plus, Sparkles, CheckCircle2 } from "lucide-react";
import { formatTimerDisplay } from "../services/sessionTimer";

interface Props {
  breakDurationMinutes?: number;
  taskName: string;
  onResumeFocus: () => void;
}

const BREATH_CYCLE_SECONDS = 12; // 4s inhale, 4s hold, 4s exhale

export function BreakMode({
  breakDurationMinutes = 5,
  taskName,
  onResumeFocus,
}: Props): JSX.Element {
  const [totalSeconds, setTotalSeconds] = useState(breakDurationMinutes * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(breakDurationMinutes * 60);
  const [isPaused, setIsPaused] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"Inhale" | "Hold" | "Exhale">("Inhale");

  // Countdown timer
  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused]);

  // Breathing pacer cycle
  useEffect(() => {
    const breathTimer = setInterval(() => {
      const cycleTime = (Math.floor(Date.now() / 1000)) % BREATH_CYCLE_SECONDS;
      if (cycleTime < 4) {
        setBreathPhase("Inhale");
      } else if (cycleTime < 8) {
        setBreathPhase("Hold");
      } else {
        setBreathPhase("Exhale");
      }
    }, 1000);

    return () => clearInterval(breathTimer);
  }, []);

  // Keyboard shortcut: Escape to resume focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onResumeFocus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onResumeFocus]);

  const handleExtendBreak = (minutes: number) => {
    setTotalSeconds((prev) => prev + minutes * 60);
    setRemainingSeconds((prev) => prev + minutes * 60);
  };

  const isCompleted = remainingSeconds === 0;

  return (
    <div
      className="break-overlay fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Calming Break Mode"
    >
      <div className="break-container">
        {/* Header Icon */}
        <div className="break-badge">
          <Coffee size={20} color="var(--color-focused)" />
          <span>Mindful Recharging Break</span>
        </div>

        {/* Breathing Animation Circle */}
        <div className="breath-circle-wrap" aria-hidden="true">
          <div className={`breath-circle breath-circle--${breathPhase.toLowerCase()}`}>
            <span className="breath-circle__text">{breathPhase}</span>
          </div>
        </div>

        {/* Timer display */}
        <div className="break-timer font-mono" aria-live="polite">
          {formatTimerDisplay(remainingSeconds)}
        </div>

        {/* Recharging Message */}
        {isCompleted ? (
          <div className="break-complete fade-in">
            <CheckCircle2 size={24} color="var(--color-focused)" />
            <h2 className="break-title">Break Complete!</h2>
            <p className="break-subtext">
              Your energy is refreshed. Ready to return to <strong>&ldquo;{taskName}&rdquo;</strong>?
            </p>
          </div>
        ) : (
          <div className="break-guidance">
            <h2 className="break-title">Rest your eyes and shoulders</h2>
            <p className="break-subtext">
              Look away from the screen, take slow deep breaths, and let your mind relax.
            </p>
          </div>
        )}

        {/* Action Controls */}
        <div className="break-actions">
          <button
            id="btn-resume-from-break"
            className="btn btn-primary btn-lg"
            onClick={onResumeFocus}
            aria-label="Resume focus on current task"
          >
            <Play size={16} />
            {isCompleted ? "Resume Focus" : "End Break & Refocus"}
          </button>

          {!isCompleted && (
            <>
              <button
                id="btn-pause-resume-break"
                className="btn btn-secondary"
                onClick={() => setIsPaused((prev) => !prev)}
                aria-label={isPaused ? "Resume break timer" : "Pause break timer"}
              >
                {isPaused ? <Play size={14} /> : <Pause size={14} />}
                {isPaused ? "Resume Break" : "Pause Break"}
              </button>

              <button
                id="btn-extend-break"
                className="btn btn-ghost"
                onClick={() => handleExtendBreak(2)}
                aria-label="Extend break by 2 minutes"
              >
                <Plus size={14} />
                +2 Minutes
              </button>
            </>
          )}
        </div>

        {/* Ambient grounding tip */}
        <div className="break-tip">
          <Sparkles size={14} color="var(--accent-400)" />
          <span>The 20-20-20 rule: Every 20 minutes, look at an object 20 feet away for 20 seconds.</span>
        </div>
      </div>
    </div>
  );
}
