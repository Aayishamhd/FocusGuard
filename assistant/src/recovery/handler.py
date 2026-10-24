"""
assistant/src/recovery/handler.py

Recovery mapping and guidance generator for Stage 5.
Maps user recovery selections to empathetic, contract-compliant assistance:
  - I'M_TIRED         -> Break suggestion
  - TASK_IS_CONFUSING -> Task assistance
  - I_GOT_DISTRACTED  -> Return-to-task assistance
  - I_NEED_A_BREAK    -> Break suggestion
  - SOMETHING_ELSE    -> Concise follow-up inquiry without assumption
"""

from __future__ import annotations

import logging
from typing import Optional

from ..decision.models import DecisionAction
from ..models.contracts import (
    RecoveryActionPayload,
    RecoveryFeedbackRequest,
    RecoveryFeedbackResponse,
)
from .models import RecoveryOption, RecoveryPlan, normalize_recovery_option

logger = logging.getLogger(__name__)


class RecoveryHandler:
    """
    Translates user-reported recovery feedback into structured plans and contract responses.
    Never judges, shames, or diagnoses.
    """

    @classmethod
    def create_recovery_plan(
        cls,
        option_raw: str,
        current_task: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> RecoveryPlan:
        """
        Parses raw user input, maps to canonical RecoveryOption, and builds RecoveryPlan.
        """
        option = normalize_recovery_option(option_raw)
        task_label = f' "{current_task.strip()}"' if current_task and current_task.strip() else ""

        if option == RecoveryOption.IM_TIRED:
            return RecoveryPlan(
                option=option,
                mapped_action=DecisionAction.BREAK_SUGGESTION,
                recommendation="take_break",
                supportive_message=(
                    "Rest is essential for focus and cognitive stamina. "
                    "Step away for a 10-minute break to recharge."
                ),
                suggested_break_minutes=10,
                suggested_next_action="Step away from the screen, stretch, or grab water.",
            )

        if option == RecoveryOption.TASK_IS_CONFUSING:
            next_step = (
                f"Open your workspace for{task_label} and write down the single smallest immediate step."
                if task_label
                else "Break your current task into the first 3 small bullet points."
            )
            return RecoveryPlan(
                option=option,
                mapped_action=DecisionAction.TASK_ASSISTANCE,
                recommendation="simplify_task",
                supportive_message=(
                    f"Complex tasks{task_label} can feel overwhelming. "
                    "Let's make this smaller and clearer so you know exactly what to do next."
                ),
                suggested_next_action=next_step,
            )

        if option == RecoveryOption.I_GOT_DISTRACTED:
            next_step = (
                f"Switch back to your active task window for{task_label}."
                if task_label
                else "Return to your last active workspace."
            )
            return RecoveryPlan(
                option=option,
                mapped_action=DecisionAction.RETURN_TO_TASK,
                recommendation="resume_previous",
                supportive_message=(
                    "Distractions happen to everyone. "
                    f"The important thing is you noticed. Ready to return{task_label}?"
                ),
                suggested_next_action=next_step,
            )

        if option == RecoveryOption.I_NEED_A_BREAK:
            return RecoveryPlan(
                option=option,
                mapped_action=DecisionAction.BREAK_SUGGESTION,
                recommendation="take_break",
                supportive_message=(
                    "Taking a pause is a smart move, not a setback. "
                    "Step away, recharge, and return whenever you feel ready."
                ),
                suggested_break_minutes=5,
                suggested_next_action="Take a 5-minute restorative pause.",
            )

        # SOMETHING_ELSE -> concise follow-up rather than assumption
        return RecoveryPlan(
            option=RecoveryOption.SOMETHING_ELSE,
            mapped_action=DecisionAction.NO_ACTION,
            recommendation="custom_tip",
            supportive_message=(
                "Got it. Every workday has unique moments. "
                "What would help you most right now?"
            ),
            follow_up_inquiry="What would be most helpful for you right now?",
            suggested_next_action="Take a deep breath and choose your next pace.",
        )

    @classmethod
    def to_contract_response(cls, plan: RecoveryPlan) -> RecoveryFeedbackResponse:
        """Converts internal RecoveryPlan into SHARED_CONTRACTS RecoveryFeedbackResponse."""
        payload: Optional[RecoveryActionPayload] = None
        if plan.suggested_break_minutes is not None or plan.suggested_next_action is not None:
            payload = RecoveryActionPayload(
                suggestedBreakMinutes=plan.suggested_break_minutes,
                suggestedNextAction=plan.suggested_next_action,
            )

        return RecoveryFeedbackResponse(
            recommendation=plan.recommendation,  # type: ignore[arg-type]
            supportiveMessage=plan.supportive_message,
            actionPayload=payload,
        )

    @classmethod
    def handle_request(cls, request: RecoveryFeedbackRequest) -> RecoveryFeedbackResponse:
        """High-level handler for POST /api/recover requests."""
        plan = cls.create_recovery_plan(
            option_raw=request.userReason,
            current_task=request.currentTask,
            notes=request.notes,
        )
        return cls.to_contract_response(plan)
