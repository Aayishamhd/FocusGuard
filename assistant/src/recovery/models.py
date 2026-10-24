"""
assistant/src/recovery/models.py

Models, enums, and mappings for FocusGuard Attention Recovery (Stage 5).
Emphasizes human autonomy, empathetic recovery assistance, and strict action mapping.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from ..decision.models import DecisionAction


class RecoveryOption(str, Enum):
    """
    Standard user-facing recovery options presented when focus drifts or interventions occur.
    """
    IM_TIRED = "I'M_TIRED"
    TASK_IS_CONFUSING = "TASK_IS_CONFUSING"
    I_GOT_DISTRACTED = "I_GOT_DISTRACTED"
    I_NEED_A_BREAK = "I_NEED_A_BREAK"
    SOMETHING_ELSE = "SOMETHING_ELSE"


class RecoveryState(str, Enum):
    """
    Lifecycle states for the recovery state machine.
    """
    IN_SESSION = "IN_SESSION"
    INTERVENTION_PENDING = "INTERVENTION_PENDING"
    RECOVERING = "RECOVERING"
    BREAK_ACTIVE = "BREAK_ACTIVE"
    POSTPONED = "POSTPONED"
    FLOW_RESUMED = "FLOW_RESUMED"


def normalize_recovery_option(val: str) -> RecoveryOption:
    """
    Normalizes both uppercase Stage 5 names and lowercase shared contract names:
    - "I'M_TIRED", "im_tired", "tired" -> RecoveryOption.IM_TIRED
    - "TASK_IS_CONFUSING", "task_confusing" -> RecoveryOption.TASK_IS_CONFUSING
    - "I_GOT_DISTRACTED", "distracted" -> RecoveryOption.I_GOT_DISTRACTED
    - "I_NEED_A_BREAK", "need_break" -> RecoveryOption.I_NEED_A_BREAK
    - "SOMETHING_ELSE", "other" -> RecoveryOption.SOMETHING_ELSE
    """
    if not val or not isinstance(val, str):
        raise ValueError("Recovery option must be a non-empty string.")

    cleaned = val.strip().upper().replace(" ", "_")

    mapping = {
        "I'M_TIRED": RecoveryOption.IM_TIRED,
        "IM_TIRED": RecoveryOption.IM_TIRED,
        "TIRED": RecoveryOption.IM_TIRED,

        "TASK_IS_CONFUSING": RecoveryOption.TASK_IS_CONFUSING,
        "TASK_CONFUSING": RecoveryOption.TASK_IS_CONFUSING,

        "I_GOT_DISTRACTED": RecoveryOption.I_GOT_DISTRACTED,
        "DISTRACTED": RecoveryOption.I_GOT_DISTRACTED,

        "I_NEED_A_BREAK": RecoveryOption.I_NEED_A_BREAK,
        "NEED_BREAK": RecoveryOption.I_NEED_A_BREAK,

        "SOMETHING_ELSE": RecoveryOption.SOMETHING_ELSE,
        "OTHER": RecoveryOption.SOMETHING_ELSE,
    }

    if cleaned in mapping:
        return mapping[cleaned]

    raise ValueError(f"Invalid recovery option: {val}")


@dataclass
class RecoveryPlan:
    """
    Structured outcome of selecting a recovery option.
    Integrates with both internal decision engine and shared API contracts.
    """
    option: RecoveryOption
    mapped_action: DecisionAction
    recommendation: str  # "take_break" | "simplify_task" | "resume_previous" | "custom_tip"
    supportive_message: str
    suggested_break_minutes: Optional[int] = None
    suggested_next_action: Optional[str] = None
    follow_up_inquiry: Optional[str] = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return {
            "option": self.option.value,
            "mapped_action": self.mapped_action.value,
            "recommendation": self.recommendation,
            "supportive_message": self.supportive_message,
            "suggested_break_minutes": self.suggested_break_minutes,
            "suggested_next_action": self.suggested_next_action,
            "follow_up_inquiry": self.follow_up_inquiry,
            "created_at": self.created_at,
        }
