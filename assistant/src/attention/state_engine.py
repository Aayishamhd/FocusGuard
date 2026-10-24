"""
assistant/src/attention/state_engine.py

Modular Attention State Engine for FocusGuard.
Performs transparent signal scoring, state transitions, confidence estimation,
and structured reason code attribution without psychological diagnosis.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional, Tuple

from ..models.contracts import AttentionEvent, AttentionState
from .context_analyzer import ContextAnalyzer
from .reason_codes import AttentionReasonCode


@dataclass
class AttentionAssessment:
    """The result of an attention state evaluation."""
    state: AttentionState
    score: float                      # Attention index in [0.0, 1.0]
    confidence: float                 # Signal observability/coverage in [0.0, 1.0]
    reason_code: AttentionReasonCode  # Structured machine-readable reason
    explanation: str                  # Human-centered, non-diagnostic rationale
    signal_breakdown: Dict[str, float]# Transparent factor weights and scores
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class AttentionStateEngine:
    """
    Evaluates streaming or point-in-time AttentionEvents to classify attention
    dynamics using a transparent, multi-factor scoring mechanism.
    """

    def __init__(
        self,
        context_analyzer: Optional[ContextAnalyzer] = None,
        history_window_size: int = 10,
        focus_threshold: float = 0.70,
        drift_threshold: float = 0.40,
    ) -> None:
        self.analyzer = context_analyzer or ContextAnalyzer()
        self.history: Deque[AttentionEvent] = deque(maxlen=history_window_size)
        self.assessments: Deque[AttentionAssessment] = deque(maxlen=history_window_size)
        self.current_state: AttentionState = AttentionState.FOCUSED
        self.focus_threshold = focus_threshold
        self.drift_threshold = drift_threshold

    def reset(self) -> None:
        """Clear historical tracking buffer."""
        self.history.clear()
        self.assessments.clear()
        self.current_state = AttentionState.FOCUSED

    def compute_stability_score(
        self,
        event: AttentionEvent,
        is_productive_switch: bool,
    ) -> float:
        """
        Computes stability factor in [0.0, 1.0].
        High switching between work tools does not penalize stability.
        """
        switch_count = event.metrics.recentSwitchCount
        app_duration = event.metrics.appDurationSeconds

        if is_productive_switch:
            # Multi-tool productive switching preserves stability
            if switch_count <= 4:
                return 1.0
            return max(0.70, 1.0 - (switch_count - 4) * 0.05)

        # Unrelated or leisure switching
        if switch_count == 0:
            return 1.0
        elif switch_count <= 2:
            return 0.85
        elif switch_count <= 4:
            return 0.60
        elif switch_count <= 7:
            return 0.35
        else:
            return 0.15

    def compute_inactivity_score(self, inactivity_seconds: float) -> float:
        """
        Computes active presence factor in [0.0, 1.0].
        Active (0-60s) = 1.0; Graceful drop to 0.0 at 300s (5 min).
        """
        if inactivity_seconds <= 60:
            return 1.0
        if inactivity_seconds >= 300:
            return 0.0
        return max(0.0, 1.0 - (inactivity_seconds - 60) / 240.0)

    def compute_confidence(
        self,
        event: AttentionEvent,
        has_conflicting_signals: bool,
    ) -> float:
        """
        Calculates signal confidence based strictly on sensor coverage and consistency.
        Never implies medical or psychological certainty.
        """
        coverage = 0.50  # Baseline: window tracker active

        if "activity_monitor" in event.sources:
            coverage += 0.25

        if "webcam_headpose" in event.sources and event.metrics.webcamEngaged is not None:
            coverage += 0.25

        # Penalize if signals are missing or conflicting
        if has_conflicting_signals:
            coverage -= 0.35

        if event.activeApp.category == "unknown":
            coverage -= 0.15

        # Dwell time bonus (longer observation provides more reliable data) only if no conflict
        if not has_conflicting_signals and event.metrics.appDurationSeconds >= 60:
            coverage += 0.10

        return max(0.10, min(1.0, round(coverage, 2)))

    def evaluate(
        self,
        event: AttentionEvent,
        current_task: Optional[str] = None,
    ) -> AttentionAssessment:
        """
        Evaluates an AttentionEvent and produces an AttentionAssessment.
        """
        prev_event = self.history[-1] if self.history else None
        prev_state = self.current_state

        # 1. Context relevance
        context_relevance = self.analyzer.compute_task_relevance(
            current_task=current_task,
            app_name=event.activeApp.appName,
            window_title=event.activeApp.windowTitle,
            category=event.activeApp.category,
        )

        # 2. Check if transition from previous app is productive
        is_productive_switch = False
        is_return_to_task = False

        if prev_event:
            is_productive_switch = self.analyzer.is_productive_switch(
                from_category=prev_event.activeApp.category,
                to_category=event.activeApp.category,
                to_title=event.activeApp.windowTitle,
            )
            # Check return from leisure/distraction to work
            if (
                prev_event.activeApp.category in ("entertainment", "unknown")
                and event.activeApp.category in ("work", "utility")
            ):
                is_return_to_task = True
        else:
            # First event: work category or explicit productive patterns
            is_productive_switch = (
                event.activeApp.category == "work"
                or any(p.search(event.activeApp.windowTitle) for p in self.analyzer.productive_patterns)
            )

        # 3. Factor scoring
        stability_score = self.compute_stability_score(event, is_productive_switch)
        inactivity_score = self.compute_inactivity_score(event.metrics.inactivitySeconds)

        # 4. Webcam signal (optional)
        webcam_available = (
            "webcam_headpose" in event.sources
            and event.metrics.webcamEngaged is not None
        )
        webcam_score: Optional[float] = None
        if webcam_available:
            webcam_score = 1.0 if event.metrics.webcamEngaged else 0.20

        # Check conflicting signals (e.g. mouse active on entertainment, or webcam engaged but idle)
        has_conflicting_signals = False
        if webcam_available:
            if event.metrics.webcamEngaged and event.activeApp.category == "entertainment":
                has_conflicting_signals = True
            elif not event.metrics.webcamEngaged and event.metrics.inactivitySeconds == 0:
                has_conflicting_signals = True

        # 5. Composite Attention Index calculation
        if webcam_score is not None:
            w_context, w_stability, w_inact, w_webcam = 0.45, 0.25, 0.20, 0.10
            composite_score = (
                w_context * context_relevance
                + w_stability * stability_score
                + w_inact * inactivity_score
                + w_webcam * webcam_score
            )
        else:
            # Dynamically redistribute webcam weight
            w_context, w_stability, w_inact = 0.50, 0.30, 0.20
            composite_score = (
                w_context * context_relevance
                + w_stability * stability_score
                + w_inact * inactivity_score
            )

        # If context relevance is extremely low (e.g. entertainment app), scale down composite score
        # so active mouse movement on YouTube cannot yield a false high attention score
        if context_relevance <= 0.20:
            composite_score = min(composite_score, context_relevance * 2.5 + 0.10)

        composite_score = round(max(0.0, min(1.0, composite_score)), 3)
        confidence = self.compute_confidence(event, has_conflicting_signals)

        # 6. State transition & Reason Code determination
        state, reason_code, explanation = self._determine_state_and_reason(
            event=event,
            composite_score=composite_score,
            confidence=confidence,
            context_relevance=context_relevance,
            prev_state=prev_state,
            is_productive_switch=is_productive_switch,
            is_return_to_task=is_return_to_task,
            current_task=current_task,
            webcam_available=webcam_available,
            has_conflicting_signals=has_conflicting_signals,
        )

        signal_breakdown = {
            "context_relevance": round(context_relevance, 2),
            "stability_score": round(stability_score, 2),
            "inactivity_score": round(inactivity_score, 2),
            "webcam_score": webcam_score if webcam_score is not None else -1.0,
            "composite_score": composite_score,
            "confidence": confidence,
        }

        assessment = AttentionAssessment(
            state=state,
            score=composite_score,
            confidence=confidence,
            reason_code=reason_code,
            explanation=explanation,
            signal_breakdown=signal_breakdown,
        )

        # Update historical state
        self.history.append(event)
        self.assessments.append(assessment)
        self.current_state = state

        return assessment

    def _determine_state_and_reason(
        self,
        event: AttentionEvent,
        composite_score: float,
        confidence: float,
        context_relevance: float,
        prev_state: AttentionState,
        is_productive_switch: bool,
        is_return_to_task: bool,
        current_task: Optional[str],
        webcam_available: bool,
        has_conflicting_signals: bool,
    ) -> Tuple[AttentionState, AttentionReasonCode, str]:
        """Maps composite score and event dynamics into attention state and reason code."""

        # Inactivity edge case: long idle
        if event.metrics.inactivitySeconds >= 300:
            return (
                AttentionState.IDLE,
                AttentionReasonCode.LONG_INACTIVITY,
                f"No input activity detected for {int(event.metrics.inactivitySeconds)} seconds.",
            )

        # Signal quality edge cases
        if has_conflicting_signals:
            if composite_score >= self.focus_threshold:
                return (
                    AttentionState.FOCUSED,
                    AttentionReasonCode.CONFLICTING_SIGNALS,
                    "Conflicting input signals detected; defaulting conservatively to focused.",
                )

        # Recovery transition: returning to work tool from drift/distraction
        if is_return_to_task or (prev_state in (AttentionState.DISTRACTED, AttentionState.POSSIBLY_DRIFTING)
                                 and event.activeApp.category in ("work", "utility")
                                 and context_relevance >= 0.70):
            return (
                AttentionState.RECOVERING,
                AttentionReasonCode.RETURN_TO_PREVIOUS_TASK,
                f"Resumed activity on primary work context ({event.activeApp.appName}).",
            )

        # Deep / Sustained Focus (requires both high composite score and relevant context)
        if (
            composite_score >= self.focus_threshold
            and context_relevance >= 0.65
            and event.activeApp.category != "unknown"
            and (event.metrics.recentSwitchCount < 4 or is_productive_switch)
        ):
            if is_productive_switch and event.metrics.recentSwitchCount >= 3:
                return (
                    AttentionState.FOCUSED,
                    AttentionReasonCode.PRODUCTIVE_CONTEXT_SWITCHING,
                    f"Productive workflow switching across {event.activeApp.category} tools.",
                )
            if event.metrics.sessionDurationSeconds >= 5400 and event.metrics.appDurationSeconds >= 1800:
                return (
                    AttentionState.FOCUSED,
                    AttentionReasonCode.SUSTAINED_DEEP_FOCUS,
                    "Sustained continuous focus on active task.",
                )
            return (
                AttentionState.FOCUSED,
                AttentionReasonCode.STABLE_TASK_CONTEXT,
                f"Stable active engagement in {event.activeApp.appName}.",
            )

        # Distracted
        if composite_score < self.drift_threshold or event.activeApp.category == "entertainment":
            if event.metrics.recentSwitchCount >= 5:
                return (
                    AttentionState.DISTRACTED,
                    AttentionReasonCode.HIGH_SWITCHING_UNRELATED_CONTEXT,
                    f"High switching frequency into non-task context ({event.activeApp.appName}).",
                )
            return (
                AttentionState.DISTRACTED,
                AttentionReasonCode.EXTENDED_UNRELATED_ACTIVITY,
                f"Sustained activity in non-task application ({event.activeApp.appName}).",
            )

        # Possible Drift (intermediate zone: 0.40 <= score < 0.70)
        if event.activeApp.category == "unknown":
            return (
                AttentionState.POSSIBLY_DRIFTING,
                AttentionReasonCode.UNCERTAIN_CONTEXT,
                f"Activity in unclassified application ({event.activeApp.appName}).",
            )

        if event.metrics.recentSwitchCount >= 4:
            return (
                AttentionState.POSSIBLY_DRIFTING,
                AttentionReasonCode.MODERATE_CONTEXT_SWITCHING,
                f"Moderate context switching frequency ({event.metrics.recentSwitchCount} switches).",
            )

        return (
            AttentionState.POSSIBLY_DRIFTING,
            AttentionReasonCode.MILD_ATTENTION_DRIFT,
            f"Attention signals indicate mild drift in {event.activeApp.appName}.",
        )
