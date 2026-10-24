"""
assistant/src/decision/models.py

Data models and enums for the FocusGuard Intervention Decision Engine (Stage 3).
Operates independently from LLM message generation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional


class DecisionAction(str, Enum):
    """Supported intervention actions."""
    NO_ACTION = "NO_ACTION"
    GENTLE_REMINDER = "GENTLE_REMINDER"
    RETURN_TO_TASK = "RETURN_TO_TASK"
    TASK_ASSISTANCE = "TASK_ASSISTANCE"
    BREAK_SUGGESTION = "BREAK_SUGGESTION"
    RECOVERY_MODE = "RECOVERY_MODE"


class DecisionPriority(str, Enum):
    """Intervention urgency."""
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class UserInterventionPreference(str, Enum):
    """User-configured interaction style."""
    GENTLE = "GENTLE"                         # Balanced, friendly, default
    MINIMAL = "MINIMAL"                       # Conservative, higher thresholds
    MOTIVATIONAL = "MOTIVATIONAL"             # Supportive prompts on hesitation/drift
    SILENT = "SILENT"                         # Passive tracking only; zero nudges
    ONLY_WHEN_NECESSARY = "ONLY_WHEN_NECESSARY" # Severe drift / 90m break only


class UserResponseOutcome(str, Enum):
    """User response to previous intervention."""
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"
    IGNORED = "ignored"
    COMPLETED = "completed"


@dataclass
class InterventionRecord:
    """Historical record of an intervention issued to the user."""
    action: DecisionAction
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    user_response: Optional[UserResponseOutcome] = None


@dataclass
class DecisionResult:
    """The concrete output of the Intervention Decision Engine."""
    action: DecisionAction
    priority: DecisionPriority
    reason_codes: List[str]
    explanation: str
    cooldown_remaining_seconds: float = 0.0
    suppressed_by: Optional[str] = None
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return {
            "action": self.action.value,
            "priority": self.priority.value,
            "reason_codes": self.reason_codes,
            "explanation": self.explanation,
            "cooldown_remaining_seconds": round(self.cooldown_remaining_seconds, 1),
            "suppressed_by": self.suppressed_by,
            "timestamp": self.timestamp,
        }
