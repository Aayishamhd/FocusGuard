"""
assistant/src/llm/deterministic_fallbacks.py

Deterministic fallback copy generator for Stage 4.
Guarantees the Attention Agent produces safe, empathetic, contract-compliant
responses even if Ollama is offline, times out, or returns invalid outputs.
"""

from __future__ import annotations

from typing import Optional

from ..decision.models import DecisionAction
from .schemas import LLMInterventionInput, LLMInterventionOutput


def get_deterministic_fallback(
    ctx: LLMInterventionInput,
) -> LLMInterventionOutput:
    """
    Produces deterministic copy for the allowed action without invoking any LLM.
    Zero latency, zero network dependencies, 100% reliable.
    """
    action = ctx.allowed_action
    app = ctx.active_app or "your other apps"
    task = ctx.current_task
    session_min = int(ctx.session_duration_seconds // 60)

    if action == DecisionAction.GENTLE_REMINDER:
        return LLMInterventionOutput(
            message=f"Notice your attention may have shifted to {app}. No worries — ready whenever you are.",
            action=DecisionAction.GENTLE_REMINDER,
        )

    if action == DecisionAction.RETURN_TO_TASK:
        if task:
            msg = f"Focus shifted over to {app}. Ready to return to \"{task}\"?"
        else:
            msg = f"Focus drifted to {app}. Ready to jump back into your work?"
        return LLMInterventionOutput(
            message=msg,
            action=DecisionAction.RETURN_TO_TASK,
        )

    if action == DecisionAction.TASK_ASSISTANCE:
        if task:
            msg = f"\"{task}\" seems like a heavy task. Let's make it smaller with an easy first step."
            step = f"Open your main workspace for \"{task}\" and list the first 3 bullet points."
        else:
            msg = "Getting started can feel overwhelming. Let's break this down into one small action."
            step = "Take the smallest immediate 5-minute action."

        return LLMInterventionOutput(
            message=msg,
            action=DecisionAction.TASK_ASSISTANCE,
            next_step=step,
        )

    if action == DecisionAction.BREAK_SUGGESTION:
        dur = max(90, session_min) if session_min >= 90 else 90
        return LLMInterventionOutput(
            message=f"You've been focused for {dur} minutes — great work! Would a 5-minute break help you recharge?",
            action=DecisionAction.BREAK_SUGGESTION,
            suggested_break_minutes=5,
        )

    if action == DecisionAction.RECOVERY_MODE:
        return LLMInterventionOutput(
            message="Welcome back. Take a moment to settle in and pick up where you left off.",
            action=DecisionAction.RECOVERY_MODE,
        )

    # NO_ACTION
    return LLMInterventionOutput(
        message="User is in flow; no intervention needed.",
        action=DecisionAction.NO_ACTION,
    )
