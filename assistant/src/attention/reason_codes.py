"""
assistant/src/attention/reason_codes.py

Structured reason codes for FocusGuard Attention State Engine.
Provides transparent, auditable explanations for state inferences.

IMPORTANT: Strictly non-diagnostic and non-psychological. FocusGuard tracks
observable desktop activity dynamics, never mental health or medical states.
"""

from __future__ import annotations

from enum import Enum


class AttentionReasonCode(str, Enum):
    # ── Focused states ───────────────────────────────────────────────────────
    STABLE_TASK_CONTEXT = "stable_task_context"
    PRODUCTIVE_CONTEXT_SWITCHING = "productive_context_switching"
    TRANSIENT_REFERENCE_LOOKUP = "transient_reference_lookup"
    SUSTAINED_DEEP_FOCUS = "sustained_deep_focus"

    # ── Possible drift states ────────────────────────────────────────────────
    MODERATE_CONTEXT_SWITCHING = "moderate_context_switching"
    UNCERTAIN_CONTEXT = "uncertain_context"
    MILD_ATTENTION_DRIFT = "mild_attention_drift"

    # ── Distracted states ────────────────────────────────────────────────────
    EXTENDED_UNRELATED_ACTIVITY = "extended_unrelated_activity"
    HIGH_SWITCHING_UNRELATED_CONTEXT = "high_switching_unrelated_context"
    LONG_INACTIVITY = "long_inactivity"

    # ── Recovering states ────────────────────────────────────────────────────
    RETURN_TO_PREVIOUS_TASK = "return_to_previous_task"
    RECENT_RECOVERY = "recent_recovery"

    # ── Signal quality & edge cases ──────────────────────────────────────────
    INSUFFICIENT_SIGNAL_EVIDENCE = "insufficient_signal_evidence"
    CONFLICTING_SIGNALS = "conflicting_signals"
    NO_CURRENT_TASK = "no_current_task"
    WEBCAM_DISENGAGED_OR_UNAVAILABLE = "webcam_disengaged_or_unavailable"
