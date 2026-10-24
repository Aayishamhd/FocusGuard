"""
assistant/src/recovery/state_machine.py

Recovery State Machine for FocusGuard Attention Agent (Stage 5).
Coordinates human autonomy, intervention lifecycles, and seamless transitions
between active session, intervention presentation, user-directed recovery, and focus resumption.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from ..decision.models import DecisionResult
from .handler import RecoveryHandler
from .models import RecoveryOption, RecoveryPlan, RecoveryState, normalize_recovery_option

logger = logging.getLogger(__name__)


class RecoveryStateMachine:
    """
    Manages the recovery lifecycle for a user session:
      IN_SESSION -> INTERVENTION_PENDING -> RECOVERING / BREAK_ACTIVE / POSTPONED -> FLOW_RESUMED -> IN_SESSION
    """

    def __init__(self, session_id: str = "default_session") -> None:
        self.session_id = session_id
        self.state: RecoveryState = RecoveryState.IN_SESSION
        self.active_decision: Optional[DecisionResult] = None
        self.active_plan: Optional[RecoveryPlan] = None
        self.state_entered_at: datetime = datetime.now(timezone.utc)
        self.postponed_until: Optional[datetime] = None

    def present_intervention(self, decision: DecisionResult) -> None:
        """Called when an intervention is presented to the user."""
        self.active_decision = decision
        self.state = RecoveryState.INTERVENTION_PENDING
        self.state_entered_at = datetime.now(timezone.utc)
        logger.info(
            "Session %s: Intervention presented (%s). Transitioned to INTERVENTION_PENDING.",
            self.session_id,
            decision.action.value,
        )

    def handle_recovery_choice(
        self,
        option_raw: str,
        current_task: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> RecoveryPlan:
        """
        User actively chooses how to recover.
        Generates empathetic RecoveryPlan and updates recovery state.
        """
        plan = RecoveryHandler.create_recovery_plan(
            option_raw=option_raw,
            current_task=current_task,
            notes=notes,
        )
        self.active_plan = plan

        if plan.option in (RecoveryOption.IM_TIRED, RecoveryOption.I_NEED_A_BREAK):
            self.state = RecoveryState.BREAK_ACTIVE
        else:
            self.state = RecoveryState.RECOVERING

        self.state_entered_at = datetime.now(timezone.utc)
        logger.info(
            "Session %s: User selected recovery option %s -> state %s.",
            self.session_id,
            plan.option.value,
            self.state.value,
        )
        return plan

    def dismiss_intervention(self) -> None:
        """User explicitly dismisses or ignores an intervention."""
        self.state = RecoveryState.IN_SESSION
        self.active_decision = None
        self.active_plan = None
        self.state_entered_at = datetime.now(timezone.utc)
        logger.info(
            "Session %s: Intervention dismissed. Transitioned to IN_SESSION.",
            self.session_id,
        )

    def postpone_intervention(self, minutes: int = 5) -> datetime:
        """User snoozes or postpones the intervention."""
        from datetime import timedelta

        self.state = RecoveryState.POSTPONED
        now = datetime.now(timezone.utc)
        self.state_entered_at = now
        self.postponed_until = now + timedelta(minutes=minutes)
        logger.info(
            "Session %s: Intervention postponed for %d minutes until %s.",
            self.session_id,
            minutes,
            self.postponed_until.isoformat(),
        )
        return self.postponed_until

    def resume_focus(self) -> None:
        """Called when user resumes productive activity."""
        self.state = RecoveryState.FLOW_RESUMED
        self.active_decision = None
        self.active_plan = None
        self.postponed_until = None
        self.state_entered_at = datetime.now(timezone.utc)

        # Transition back to normal session
        self.state = RecoveryState.IN_SESSION
        logger.info(
            "Session %s: Focus resumed. Transitioned to IN_SESSION.",
            self.session_id,
        )

    def is_in_cooldown_or_break(self, now: Optional[datetime] = None) -> bool:
        """Returns True if user is currently taking a break or in a postponed state."""
        current_time = now or datetime.now(timezone.utc)
        if self.state == RecoveryState.BREAK_ACTIVE:
            return True
        if self.state == RecoveryState.POSTPONED and self.postponed_until:
            return current_time < self.postponed_until
        return False
