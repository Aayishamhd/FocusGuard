"""
assistant/src/guardrails/safety_filter.py

Safety filter preventing judgmental, shaming, or medical diagnostic language
from reaching the user. Replaces unsafe patterns with supportive, neutral, and
empowering language in accordance with FocusGuard human-centered principles.
"""

from __future__ import annotations

import re
from typing import Optional

from ..models.contracts import (
    InterventionDecision,
    RecoveryFeedbackResponse,
    TaskDecompositionResponse,
)

# Shaming & judgmental terms -> gentle alternatives
SHAMING_REPLACEMENTS = [
    (r"\b(you are\s+|you're\s+|be\s+|being\s+)?lazy\b", "your focus may have drifted"),
    (r"\b(stop\s+wasting|wasting)\s+time\b", "take a step back"),
    (r"\b(slacking\s+off|slacker)\b", "taking an unintended pause"),
    (r"\b(you\s+failed|you're\s+failing|failure)\b", "it's time to reset"),
    (r"\b(get\s+your\s+act\s+together)\b", "take a deep breath and start fresh"),
    (r"\b(procrastinating\s+badly|shameful|terrible\s+focus)\b", "experiencing a dip in focus"),
]

# Medical & psychiatric diagnosis terms -> neutral observational alternatives
DIAGNOSTIC_REPLACEMENTS = [
    (r"\b(adhd|add)\b", "attention fluctuation"),
    (r"\b(clinically\s+depressed|depression)\b", "low energy or fatigue"),
    (r"\b(anxiety\s+disorder|anxious\s+state)\b", "feeling overloaded"),
    (r"\b(bipolar|neurotic|pathological)\b", "fluctuating workflow"),
    (r"\b(mental\s+illness|mental\s+disorder)\b", "strain or cognitive overload"),
]


def sanitize_text(text: Optional[str]) -> Optional[str]:
    """
    Scans a string for forbidden shaming or diagnostic phrasing and substitutes
    safe, supportive, and non-judgmental language.
    """
    if text is None:
        return None

    cleaned = text
    # Replace shaming patterns
    for pattern, replacement in SHAMING_REPLACEMENTS:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    # Replace medical diagnostic patterns
    for pattern, replacement in DIAGNOSTIC_REPLACEMENTS:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    return cleaned


def sanitize_decision(decision: InterventionDecision) -> InterventionDecision:
    """
    Ensures an InterventionDecision contains no harmful, shaming, or diagnostic text.
    """
    decision.message = sanitize_text(decision.message)
    decision.triggerReason = sanitize_text(decision.triggerReason) or decision.triggerReason
    return decision


def sanitize_recovery(
    response: RecoveryFeedbackResponse,
) -> RecoveryFeedbackResponse:
    """
    Ensures a RecoveryFeedbackResponse contains no harmful, shaming, or diagnostic text.
    """
    response.supportiveMessage = (
        sanitize_text(response.supportiveMessage) or response.supportiveMessage
    )
    return response


def sanitize_decomposition(
    response: TaskDecompositionResponse,
) -> TaskDecompositionResponse:
    """
    Ensures a TaskDecompositionResponse contains no harmful or overwhelming language.
    """
    for subtask in response.subtasks:
        subtask.title = sanitize_text(subtask.title) or subtask.title
        subtask.description = sanitize_text(subtask.description) or subtask.description
    return response
