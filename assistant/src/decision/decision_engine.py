"""
assistant/src/decision/decision_engine.py

FocusGuard Intervention Decision Engine (Stage 3).
Answers: "Should FocusGuard actually intervene right now?"

Independent from LLM message generation. Applies deterministic logic,
cooldown timers, dismissal back-off, and user preference filters.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Deque, List, Optional, Tuple

from ..attention.reason_codes import AttentionReasonCode
from ..attention.state_engine import AttentionAssessment
from ..models.contracts import AttentionEvent, AttentionState
from .models import (
    DecisionAction,
    DecisionPriority,
    DecisionResult,
    InterventionRecord,
    UserInterventionPreference,
    UserResponseOutcome,
)


class InterventionDecisionEngine:
    """
    Decides whether and how FocusGuard should intervene.
    Maintains intervention history, cooldown tracking, and dismissal counts.
    """

    DEFAULT_COOLDOWN_SECONDS: float = 180.0       # 3 minutes default
    BREAK_COOLDOWN_SECONDS: float = 600.0          # 10 minutes for break suggestions
    SUGGESTION_COOLDOWN_SECONDS: float = 240.0     # 4 minutes for return_to_task

    def __init__(
        self,
        default_preference: UserInterventionPreference = UserInterventionPreference.GENTLE,
        base_cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS,
        history_size: int = 20,
        personalization_engine: Optional[Any] = None,
    ) -> None:
        self.preference = default_preference
        self.base_cooldown = base_cooldown_seconds
        self.intervention_history: Deque[InterventionRecord] = deque(maxlen=history_size)
        self.consecutive_dismissals: int = 0
        self.last_intervention_time: Optional[datetime] = None
        self.personalization_engine = personalization_engine

    def record_user_response(self, outcome: UserResponseOutcome) -> None:
        """
        Updates dismissal tracking and adaptive back-off when user responds.
        """
        if self.intervention_history:
            self.intervention_history[-1].user_response = outcome

        if outcome == UserResponseOutcome.DISMISSED:
            self.consecutive_dismissals += 1
            if self.personalization_engine:
                from ..personalization.models import OutcomeType
                self.personalization_engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        elif outcome in (UserResponseOutcome.ACCEPTED, UserResponseOutcome.COMPLETED):
            self.consecutive_dismissals = 0
            if self.personalization_engine:
                from ..personalization.models import OutcomeType
                self.personalization_engine.record_outcome(OutcomeType.ACCEPTED_INTERVENTION)

    def get_effective_cooldown(self, action: DecisionAction) -> float:
        """Calculates cooldown duration scaled by consecutive dismissal back-off."""
        if action == DecisionAction.BREAK_SUGGESTION:
            base = self.BREAK_COOLDOWN_SECONDS
        elif action in (DecisionAction.RETURN_TO_TASK, DecisionAction.TASK_ASSISTANCE):
            base = self.SUGGESTION_COOLDOWN_SECONDS
        else:
            base = self.base_cooldown

        if self.personalization_engine:
            backoff_multiplier = self.personalization_engine.profile.adaptive.cooldown_multiplier
        else:
            # Scale cooldown linearly by dismissal count (1.0x, 1.5x, 2.0x, 2.5x...)
            backoff_multiplier = 1.0 + (0.5 * self.consecutive_dismissals)
        return base * backoff_multiplier

    def check_cooldown(
        self, candidate_action: DecisionAction, now: Optional[datetime] = None
    ) -> Tuple[bool, float]:
        """
        Returns (is_active, remaining_seconds).
        """
        if not self.last_intervention_time or candidate_action == DecisionAction.NO_ACTION:
            return False, 0.0

        current_time = now or datetime.now(timezone.utc)
        elapsed = (current_time - self.last_intervention_time).total_seconds()
        required_cooldown = self.get_effective_cooldown(candidate_action)

        if elapsed < required_cooldown:
            return True, max(0.0, required_cooldown - elapsed)

        return False, 0.0

    def decide(
        self,
        assessment: AttentionAssessment,
        event: AttentionEvent,
        current_task: Optional[str] = None,
        preference: Optional[UserInterventionPreference] = None,
        now: Optional[datetime] = None,
    ) -> DecisionResult:
        """
        Evaluates context, state, confidence, cooldown, preferences, and dismissal history
        to determine the single best action.
        """
        if self.personalization_engine and preference is None:
            active_pref = self.personalization_engine.profile.adaptive.effective_preference
        else:
            active_pref = preference or self.preference
        eval_time = now or datetime.now(timezone.utc)

        # ── 1. SILENT PREFERENCE CHECK ─────────────────────────────────────────
        if active_pref == UserInterventionPreference.SILENT:
            return DecisionResult(
                action=DecisionAction.NO_ACTION,
                priority=DecisionPriority.NONE,
                reason_codes=[assessment.reason_code.value],
                explanation="User preference is SILENT — all interventions suppressed.",
                suppressed_by="silent_preference",
            )

        # ── 2. LOW CONFIDENCE RULE ─────────────────────────────────────────────
        # If signal confidence is low (< 0.50), always prefer NO_ACTION to avoid false alarms
        if assessment.confidence < 0.50:
            return DecisionResult(
                action=DecisionAction.NO_ACTION,
                priority=DecisionPriority.NONE,
                reason_codes=[
                    assessment.reason_code.value,
                    AttentionReasonCode.INSUFFICIENT_SIGNAL_EVIDENCE.value,
                ],
                explanation=f"Signal confidence ({assessment.confidence:.2f}) below threshold — suppressing intervention.",
                suppressed_by="low_confidence",
            )

        # ── 3. RECOVERING & FOCUSED STATES ─────────────────────────────────────
        if assessment.state == AttentionState.RECOVERING:
            return DecisionResult(
                action=DecisionAction.NO_ACTION,
                priority=DecisionPriority.NONE,
                reason_codes=[assessment.reason_code.value],
                explanation="User is actively recovering task focus — allowing uninterrupted flow.",
            )

        # ── 4. SUSTAINED FOCUS BREAK EVALUATION ───────────────────────────────
        if assessment.state == AttentionState.FOCUSED:
            session_seconds = event.metrics.sessionDurationSeconds
            break_threshold = (
                self.personalization_engine.profile.adaptive.break_interval_minutes * 60
                if self.personalization_engine
                else 5400
            )
            if session_seconds >= break_threshold:
                candidate_action = DecisionAction.BREAK_SUGGESTION
                candidate_priority = DecisionPriority.MEDIUM
                candidate_reasons = [
                    AttentionReasonCode.SUSTAINED_DEEP_FOCUS.value,
                    f"session_exceeds_{int(break_threshold // 60)}_minutes",
                ]
                explanation = f"User has been focused for {int(session_seconds // 60)} minutes — gentle break recommendation."
            else:
                return DecisionResult(
                    action=DecisionAction.NO_ACTION,
                    priority=DecisionPriority.NONE,
                    reason_codes=[assessment.reason_code.value],
                    explanation="User is productively focused — no action required.",
                )
        else:
            # ── 5. DRIFT / DISTRACTION CANDIDATE SELECTION ─────────────────────
            candidate_action, candidate_priority, candidate_reasons, explanation = self._select_candidate_action(
                assessment=assessment,
                event=event,
                current_task=current_task,
                preference=active_pref,
            )

        # If candidate is NO_ACTION, return immediately
        if candidate_action == DecisionAction.NO_ACTION:
            return DecisionResult(
                action=DecisionAction.NO_ACTION,
                priority=DecisionPriority.NONE,
                reason_codes=candidate_reasons,
                explanation=explanation,
            )

        # ── 6. REPEATED DISMISSAL BACK-OFF ────────────────────────────────────
        if self.consecutive_dismissals >= 2:
            # If user has repeatedly dismissed interventions, reduce frequency
            if candidate_action == DecisionAction.GENTLE_REMINDER:
                return DecisionResult(
                    action=DecisionAction.NO_ACTION,
                    priority=DecisionPriority.NONE,
                    reason_codes=candidate_reasons + ["repeated_dismissals_backoff"],
                    explanation=f"User dismissed previous {self.consecutive_dismissals} interventions — backing off.",
                    suppressed_by="repeated_dismissal",
                )
            elif candidate_action == DecisionAction.RETURN_TO_TASK and self.consecutive_dismissals >= 3:
                return DecisionResult(
                    action=DecisionAction.NO_ACTION,
                    priority=DecisionPriority.NONE,
                    reason_codes=candidate_reasons + ["repeated_dismissals_backoff"],
                    explanation="User repeatedly dismissed interventions — respecting autonomy.",
                    suppressed_by="repeated_dismissal",
                )

        # ── 7. USER PREFERENCE FILTERING ──────────────────────────────────────
        if active_pref == UserInterventionPreference.ONLY_WHEN_NECESSARY:
            # Suppress gentle reminders; only allow severe distraction or breaks
            if candidate_action == DecisionAction.GENTLE_REMINDER:
                return DecisionResult(
                    action=DecisionAction.NO_ACTION,
                    priority=DecisionPriority.NONE,
                    reason_codes=candidate_reasons,
                    explanation="Preference is ONLY_WHEN_NECESSARY — gentle reminder suppressed.",
                    suppressed_by="preference_only_when_necessary",
                )

        if active_pref == UserInterventionPreference.MINIMAL:
            # Minimal preference requires higher confidence (>=0.70)
            if assessment.confidence < 0.70:
                return DecisionResult(
                    action=DecisionAction.NO_ACTION,
                    priority=DecisionPriority.NONE,
                    reason_codes=candidate_reasons,
                    explanation="Preference is MINIMAL with sub-0.70 confidence — suppressed.",
                    suppressed_by="preference_minimal_confidence",
                )
            # Downgrade RETURN_TO_TASK to least intrusive GENTLE_REMINDER
            if candidate_action == DecisionAction.RETURN_TO_TASK:
                candidate_action = DecisionAction.GENTLE_REMINDER
                candidate_priority = DecisionPriority.LOW
                explanation = "MINIMAL preference: downgraded to least intrusive gentle reminder."

        # ── 8. COOLDOWN ENFORCEMENT ───────────────────────────────────────────
        is_cooling_down, remaining = self.check_cooldown(candidate_action, now=eval_time)
        if is_cooling_down:
            return DecisionResult(
                action=DecisionAction.NO_ACTION,
                priority=DecisionPriority.NONE,
                reason_codes=candidate_reasons,
                explanation=f"Intervention cooldown active ({int(remaining)}s remaining).",
                cooldown_remaining_seconds=remaining,
                suppressed_by="cooldown",
            )

        # ── 9. CONFIRM & COMMIT INTERVENTION ──────────────────────────────────
        record = InterventionRecord(action=candidate_action, timestamp=eval_time)
        self.intervention_history.append(record)
        self.last_intervention_time = eval_time

        return DecisionResult(
            action=candidate_action,
            priority=candidate_priority,
            reason_codes=candidate_reasons,
            explanation=explanation,
        )

    def _select_candidate_action(
        self,
        assessment: AttentionAssessment,
        event: AttentionEvent,
        current_task: Optional[str],
        preference: UserInterventionPreference,
    ) -> Tuple[DecisionAction, DecisionPriority, List[str], str]:
        """Maps assessment context into candidate decision action."""
        category = event.activeApp.category
        app = event.activeApp.appName
        switch_count = event.metrics.recentSwitchCount
        app_duration = event.metrics.appDurationSeconds

        # IDLE state
        if assessment.state == AttentionState.IDLE:
            return (
                DecisionAction.GENTLE_REMINDER,
                DecisionPriority.LOW,
                [AttentionReasonCode.LONG_INACTIVITY.value],
                f"User idle for {int(event.metrics.inactivitySeconds)} seconds — gentle check-in.",
            )

        # DISTRACTED in work/utility tool -> User is stuck or experiencing hesitation
        if assessment.state == AttentionState.DISTRACTED and category in ("work", "utility"):
            return (
                DecisionAction.TASK_ASSISTANCE,
                DecisionPriority.MEDIUM,
                ["task_ambiguity_or_hesitation", assessment.reason_code.value],
                f"User appears stuck or hesitating in {app} — offering task micro-step assistance.",
            )

        # DISTRACTED in leisure / entertainment app
        if assessment.state == AttentionState.DISTRACTED:
            # If user has been on entertainment for >= 180s or many switches -> RETURN_TO_TASK
            if app_duration >= 180 or switch_count >= 5:
                return (
                    DecisionAction.RETURN_TO_TASK,
                    DecisionPriority.MEDIUM,
                    [AttentionReasonCode.EXTENDED_UNRELATED_ACTIVITY.value],
                    f"Sustained activity on {app} ({int(app_duration)}s) — suggesting return to task.",
                )
            # Least intrusive first step for early distraction
            return (
                DecisionAction.GENTLE_REMINDER,
                DecisionPriority.LOW,
                [AttentionReasonCode.MILD_ATTENTION_DRIFT.value],
                f"Attention shifted to {app} — least intrusive gentle reminder.",
            )

        # POSSIBLY_DRIFTING
        if assessment.state == AttentionState.POSSIBLY_DRIFTING:
            # Check if personalization prefers task assistance
            prefers_assistance = (
                self.personalization_engine.profile.adaptive.prefers_task_assistance
                if self.personalization_engine
                else False
            )
            if prefers_assistance:
                return (
                    DecisionAction.TASK_ASSISTANCE,
                    DecisionPriority.LOW,
                    ["personalized_task_assistance_preference"],
                    "Personalized adaptation: offering task micro-step assistance based on user preference.",
                )

            # If user is in a work tool but switching between tools with ambiguous task
            if category in ("work", "utility") and current_task and app_duration >= 120:
                return (
                    DecisionAction.TASK_ASSISTANCE,
                    DecisionPriority.LOW,
                    ["task_hesitation_assistance"],
                    f"Prolonged context switching on task '{current_task}' — offering task decomposition.",
                )

            # Leisure app during drifting state
            if category == "entertainment":
                if switch_count >= 4:
                    return (
                        DecisionAction.RETURN_TO_TASK,
                        DecisionPriority.MEDIUM,
                        [AttentionReasonCode.MODERATE_CONTEXT_SWITCHING.value],
                        f"Frequent switching into entertainment app {app}.",
                    )
                return (
                    DecisionAction.GENTLE_REMINDER,
                    DecisionPriority.LOW,
                    [AttentionReasonCode.MILD_ATTENTION_DRIFT.value],
                    f"Mild drift observed in {app} — gentle reminder.",
                )

            # Unknown or utility category
            if switch_count >= 4:
                return (
                    DecisionAction.GENTLE_REMINDER,
                    DecisionPriority.LOW,
                    [AttentionReasonCode.MODERATE_CONTEXT_SWITCHING.value],
                    f"Moderate switching across {app}.",
                )

            return (
                DecisionAction.NO_ACTION,
                DecisionPriority.NONE,
                [assessment.reason_code.value],
                "Mild drift within acceptable bounds — no action needed.",
            )

        # Default fallback
        return (
            DecisionAction.NO_ACTION,
            DecisionPriority.NONE,
            [assessment.reason_code.value],
            "No intervention warranted.",
        )
