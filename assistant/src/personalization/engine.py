"""
assistant/src/personalization/engine.py

FocusGuard Transparent Personalization Engine (Stage 5).
Tracks aggregated outcomes and applies deterministic, explainable adaptation rules.
No black-box ML. Strictly privacy-preserving.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union

from ..decision.models import UserInterventionPreference
from .models import (
    AdaptiveParameters,
    AggregatedOutcomes,
    OutcomeType,
    PersonalizationProfile,
)

logger = logging.getLogger(__name__)


class PersonalizationEngine:
    """
    Coordinates user adaptation via transparent, deterministic heuristics:
    1. Repeated dismissal -> reduces reminder frequency by scaling cooldown and stepping down sensitivity.
    2. Repeated assistance -> prioritizes task decomposition when drift is detected.
    3. Repeated break requests -> adapts break intervals to shorter cadences.
    """

    def __init__(
        self,
        user_id: str = "local_user",
        base_preference: UserInterventionPreference = UserInterventionPreference.GENTLE,
    ) -> None:
        self.profile = PersonalizationProfile(
            user_id=user_id,
            base_preference=base_preference,
            outcomes=AggregatedOutcomes(),
            adaptive=AdaptiveParameters(),
        )
        self._recompute_adaptation()

    def record_outcome(self, outcome: Union[OutcomeType, str]) -> AdaptiveParameters:
        """
        Records an aggregated outcome event and immediately re-evaluates adaptation rules.
        """
        if isinstance(outcome, str):
            try:
                outcome = OutcomeType(outcome)
            except ValueError:
                raise ValueError(f"Invalid outcome type: {outcome}")

        outcomes = self.profile.outcomes
        outcomes.total_interventions += 1

        if outcome == OutcomeType.DISMISSED_INTERVENTION:
            outcomes.dismissed_interventions += 1
            outcomes.consecutive_dismissals += 1
            logger.info("Personalization: dismissal recorded (streak: %d).", outcomes.consecutive_dismissals)

        elif outcome == OutcomeType.ACCEPTED_INTERVENTION:
            outcomes.accepted_interventions += 1
            outcomes.consecutive_dismissals = 0
            logger.info("Personalization: intervention accepted (streak reset to 0).")

        elif outcome == OutcomeType.POSTPONED_INTERVENTION:
            outcomes.postponed_interventions += 1
            # Postpone is not considered an explicit dismissal, does not increment streak
            logger.info("Personalization: intervention postponed.")

        elif outcome == OutcomeType.REQUESTED_ASSISTANCE:
            outcomes.requested_assistance += 1
            outcomes.consecutive_dismissals = 0
            logger.info("Personalization: task assistance requested.")

        elif outcome == OutcomeType.REQUESTED_BREAK:
            outcomes.requested_break += 1
            outcomes.consecutive_dismissals = 0
            logger.info("Personalization: break requested.")

        self.profile.last_updated = datetime.now(timezone.utc).isoformat()
        return self._recompute_adaptation()

    def set_base_preference(self, preference: UserInterventionPreference) -> None:
        """Allows user to change their fundamental interaction style at any time."""
        self.profile.base_preference = preference
        self.profile.last_updated = datetime.now(timezone.utc).isoformat()
        self._recompute_adaptation()
        logger.info("Personalization: base preference updated to %s.", preference.value)

    def reset(self) -> None:
        """Resets all metrics back to virgin state."""
        self.profile.outcomes = AggregatedOutcomes()
        self.profile.adaptive = AdaptiveParameters()
        self.profile.last_updated = datetime.now(timezone.utc).isoformat()
        self._recompute_adaptation()
        logger.info("Personalization: profile reset to default.")

    def _recompute_adaptation(self) -> AdaptiveParameters:
        """
        Deterministic, fully explainable adaptation rules.
        """
        outcomes = self.profile.outcomes
        base_pref = self.profile.base_preference
        consecutive = outcomes.consecutive_dismissals

        # 1. Cooldown scaling on repeated dismissals
        # Formula: 1.0 + 0.5 * consecutive_dismissals (capped at 4.0x)
        multiplier = 1.0 + (0.5 * consecutive)
        multiplier = min(4.0, multiplier)

        # 2. Step-down intervention style if repeated dismissals persist
        effective_pref = base_pref
        if consecutive >= 4 and base_pref != UserInterventionPreference.SILENT:
            effective_pref = UserInterventionPreference.MINIMAL

        # 3. Task assistance preference rule
        engaged_count = (
            outcomes.accepted_interventions
            + outcomes.requested_assistance
            + outcomes.requested_break
        )
        assistance_affinity = (
            outcomes.requested_assistance / max(1, engaged_count)
            if engaged_count > 0
            else 0.0
        )
        prefers_assistance = (
            outcomes.requested_assistance >= 2 and assistance_affinity >= 0.35
        )

        # 4. Break interval rule
        break_mins = 60 if outcomes.requested_break >= 3 else 90

        # 5. Transparent Explanation
        explanations = []
        if consecutive >= 2:
            explanations.append(
                f"Reminder frequency reduced ({multiplier:.1f}x cooldown) "
                f"due to {consecutive} consecutive dismissals."
            )
        if prefers_assistance:
            explanations.append(
                "Task assistance prioritized based on frequent requests for task simplification."
            )
        if break_mins < 90:
            explanations.append(
                "Break suggestions scheduled at 60 minutes based on your typical recharge cadence."
            )
        if effective_pref != base_pref:
            explanations.append(
                f"Interaction style temporarily stepped down to {effective_pref.value}."
            )

        explanation_str = " ".join(explanations) if explanations else "Standard gentle settings active."

        adaptive = AdaptiveParameters(
            cooldown_multiplier=round(multiplier, 2),
            effective_preference=effective_pref,
            prefers_task_assistance=prefers_assistance,
            task_assistance_affinity=round(assistance_affinity, 2),
            break_interval_minutes=break_mins,
            explanation=explanation_str,
        )
        self.profile.adaptive = adaptive
        return adaptive

    # ----------------------------------------------------------------------
    # Persistence
    # ----------------------------------------------------------------------

    def to_dict(self) -> dict:
        """Serializes profile to dictionary."""
        return self.profile.model_dump()

    def save_to_file(self, filepath: Union[str, Path]) -> None:
        """Persists profile to disk as JSON."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)
        logger.info("Personalization: profile saved to %s.", path)

    @classmethod
    def load_from_file(cls, filepath: Union[str, Path]) -> "PersonalizationEngine":
        """Loads profile from JSON file on disk, or returns default if file missing/invalid."""
        path = Path(filepath)
        if not path.is_file():
            logger.warning("Personalization: profile file %s not found. Using defaults.", path)
            return cls()

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            engine = cls(user_id=data.get("user_id", "local_user"))
            engine.profile = PersonalizationProfile.model_validate(data)
            engine._recompute_adaptation()
            return engine
        except Exception as exc:
            logger.error("Personalization: failed to load %s: %s. Using default.", path, exc)
            return cls()
