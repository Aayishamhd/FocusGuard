"""
assistant/src/personalization/models.py

Models and schemas for FocusGuard Transparent Personalization (Stage 5).
Strictly privacy-preserving: stores only aggregated outcome counts and transparent adaptive rules.
Zero storage of raw webcam frames, screenshots, window titles, or activity logs.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from ..decision.models import UserInterventionPreference


class OutcomeType(str, Enum):
    """Supported aggregated outcome events."""
    ACCEPTED_INTERVENTION = "accepted_intervention"
    DISMISSED_INTERVENTION = "dismissed_intervention"
    POSTPONED_INTERVENTION = "postponed_intervention"
    REQUESTED_ASSISTANCE = "requested_assistance"
    REQUESTED_BREAK = "requested_break"


class AggregatedOutcomes(BaseModel):
    """
    Privacy-preserving aggregate outcome counters.
    Contains strictly summary integers.
    """
    total_interventions: int = 0
    accepted_interventions: int = 0
    dismissed_interventions: int = 0
    postponed_interventions: int = 0
    requested_assistance: int = 0
    requested_break: int = 0
    consecutive_dismissals: int = 0


class AdaptiveParameters(BaseModel):
    """
    Transparent, explainable adaptation parameters derived deterministically from outcomes.
    No black-box ML model.
    """
    cooldown_multiplier: float = 1.0
    effective_preference: UserInterventionPreference = UserInterventionPreference.GENTLE
    prefers_task_assistance: bool = False
    task_assistance_affinity: float = 0.0
    break_interval_minutes: int = 90
    explanation: str = "Default gentle settings active."


class PersonalizationProfile(BaseModel):
    """
    Full user personalization profile for auditability and JSON persistence.
    """
    user_id: str = "local_user"
    base_preference: UserInterventionPreference = UserInterventionPreference.GENTLE
    outcomes: AggregatedOutcomes = Field(default_factory=AggregatedOutcomes)
    adaptive: AdaptiveParameters = Field(default_factory=AdaptiveParameters)
    last_updated: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
