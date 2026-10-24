"""
assistant/src/decision/__init__.py

Stage 3 Intervention Decision Engine package for FocusGuard.
Determines whether and how to intervene, independently from LLM message generation.
"""

from .decision_engine import InterventionDecisionEngine
from .models import (
    DecisionAction,
    DecisionPriority,
    DecisionResult,
    InterventionRecord,
    UserInterventionPreference,
    UserResponseOutcome,
)

__all__ = [
    "DecisionAction",
    "DecisionPriority",
    "DecisionResult",
    "InterventionRecord",
    "UserInterventionPreference",
    "UserResponseOutcome",
    "InterventionDecisionEngine",
]
