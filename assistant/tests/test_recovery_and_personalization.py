"""
assistant/tests/test_recovery_and_personalization.py

Stage 5 Unit Tests:
- Every recovery option & action mapping
- Normalization (uppercase Stage 5 & lowercase shared contracts)
- Recovery state machine lifecycle & transitions
- Repeated dismissal cooldown scaling & style step-down
- Repeated acceptance resetting back-off
- Task assistance preference adaptation
- Break interval adaptation (90m -> 60m)
- Preference changes
- Persistence (JSON save / load / corrupt fallback)
- Missing / invalid feedback handling
- Strict privacy audit (zero telemetry / raw data in profile)
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from src.attention.reason_codes import AttentionReasonCode
from src.attention.state_engine import AttentionAssessment
from src.decision.decision_engine import InterventionDecisionEngine
from src.decision.models import (
    DecisionAction,
    DecisionPriority,
    DecisionResult,
    UserInterventionPreference,
    UserResponseOutcome,
)
from src.models.contracts import (
    ActiveApp,
    AttentionEvent,
    AttentionMetrics,
    AttentionState,
    RecoveryFeedbackRequest,
)
from src.personalization.engine import PersonalizationEngine
from src.personalization.models import (
    AdaptiveParameters,
    AggregatedOutcomes,
    OutcomeType,
    PersonalizationProfile,
)
from src.recovery.handler import RecoveryHandler
from src.recovery.models import (
    RecoveryOption,
    RecoveryPlan,
    RecoveryState,
    normalize_recovery_option,
)
from src.recovery.state_machine import RecoveryStateMachine


# ---------------------------------------------------------------------------
# Test Recovery Options & Action Mapping
# ---------------------------------------------------------------------------

class TestRecoveryOptionsAndMapping:
    def test_im_tired_mapping(self):
        plan = RecoveryHandler.create_recovery_plan(
            option_raw="I'M_TIRED",
            current_task="Fix bug in parser",
        )
        assert plan.option == RecoveryOption.IM_TIRED
        assert plan.mapped_action == DecisionAction.BREAK_SUGGESTION
        assert plan.recommendation == "take_break"
        assert plan.suggested_break_minutes == 10
        assert "Rest is essential" in plan.supportive_message
        assert plan.follow_up_inquiry is None

    def test_task_is_confusing_mapping(self):
        plan = RecoveryHandler.create_recovery_plan(
            option_raw="TASK_IS_CONFUSING",
            current_task="Architect Multi-Agent Orchestrator",
        )
        assert plan.option == RecoveryOption.TASK_IS_CONFUSING
        assert plan.mapped_action == DecisionAction.TASK_ASSISTANCE
        assert plan.recommendation == "simplify_task"
        assert plan.suggested_break_minutes is None
        assert "Multi-Agent Orchestrator" in plan.suggested_next_action
        assert "Complex tasks" in plan.supportive_message

    def test_i_got_distracted_mapping(self):
        plan = RecoveryHandler.create_recovery_plan(
            option_raw="I_GOT_DISTRACTED",
            current_task="Write documentation",
        )
        assert plan.option == RecoveryOption.I_GOT_DISTRACTED
        assert plan.mapped_action == DecisionAction.RETURN_TO_TASK
        assert plan.recommendation == "resume_previous"
        assert "Distractions happen" in plan.supportive_message
        assert "Write documentation" in plan.suggested_next_action

    def test_i_need_a_break_mapping(self):
        plan = RecoveryHandler.create_recovery_plan(
            option_raw="I_NEED_A_BREAK",
        )
        assert plan.option == RecoveryOption.I_NEED_A_BREAK
        assert plan.mapped_action == DecisionAction.BREAK_SUGGESTION
        assert plan.recommendation == "take_break"
        assert plan.suggested_break_minutes == 5
        assert "smart move" in plan.supportive_message

    def test_something_else_mapping(self):
        plan = RecoveryHandler.create_recovery_plan(
            option_raw="SOMETHING_ELSE",
        )
        assert plan.option == RecoveryOption.SOMETHING_ELSE
        assert plan.mapped_action == DecisionAction.NO_ACTION
        assert plan.recommendation == "custom_tip"
        # Must provide concise follow-up rather than assumption
        assert plan.follow_up_inquiry == "What would be most helpful for you right now?"
        assert "What would help you most right now?" in plan.supportive_message

    def test_normalization_aliases(self):
        assert normalize_recovery_option("I'M_TIRED") == RecoveryOption.IM_TIRED
        assert normalize_recovery_option("tired") == RecoveryOption.IM_TIRED
        assert normalize_recovery_option("TASK_IS_CONFUSING") == RecoveryOption.TASK_IS_CONFUSING
        assert normalize_recovery_option("task_confusing") == RecoveryOption.TASK_IS_CONFUSING
        assert normalize_recovery_option("I_GOT_DISTRACTED") == RecoveryOption.I_GOT_DISTRACTED
        assert normalize_recovery_option("distracted") == RecoveryOption.I_GOT_DISTRACTED
        assert normalize_recovery_option("I_NEED_A_BREAK") == RecoveryOption.I_NEED_A_BREAK
        assert normalize_recovery_option("need_break") == RecoveryOption.I_NEED_A_BREAK
        assert normalize_recovery_option("SOMETHING_ELSE") == RecoveryOption.SOMETHING_ELSE
        assert normalize_recovery_option("other") == RecoveryOption.SOMETHING_ELSE

    def test_invalid_recovery_option_raises(self):
        with pytest.raises(ValueError, match="Invalid recovery option"):
            normalize_recovery_option("unsupported_choice")

    def test_missing_recovery_option_raises(self):
        with pytest.raises(ValueError, match="non-empty string"):
            normalize_recovery_option("")


# ---------------------------------------------------------------------------
# Test Recovery State Machine Lifecycle
# ---------------------------------------------------------------------------

class TestRecoveryStateMachine:
    def test_lifecycle_and_transitions(self):
        sm = RecoveryStateMachine(session_id="test-session-1")
        assert sm.state == RecoveryState.IN_SESSION

        # 1. Present intervention
        decision = DecisionResult(
            action=DecisionAction.RETURN_TO_TASK,
            priority=DecisionPriority.MEDIUM,
            reason_codes=["extended_unrelated_activity"],
            explanation="Distraction detected",
        )
        sm.present_intervention(decision)
        assert sm.state == RecoveryState.INTERVENTION_PENDING
        assert sm.active_decision == decision

        # 2. User selects I'M_TIRED -> transitions to BREAK_ACTIVE
        plan = sm.handle_recovery_choice("I'M_TIRED", current_task="Coding")
        assert sm.state == RecoveryState.BREAK_ACTIVE
        assert sm.is_in_cooldown_or_break() is True

        # 3. User resumes focus -> transitions back to IN_SESSION
        sm.resume_focus()
        assert sm.state == RecoveryState.IN_SESSION
        assert sm.is_in_cooldown_or_break() is False

    def test_task_confusion_transitions_to_recovering(self):
        sm = RecoveryStateMachine(session_id="test-session-2")
        decision = DecisionResult(
            action=DecisionAction.TASK_ASSISTANCE,
            priority=DecisionPriority.LOW,
            reason_codes=["task_hesitation"],
            explanation="Hesitation detected",
        )
        sm.present_intervention(decision)
        sm.handle_recovery_choice("TASK_IS_CONFUSING")
        assert sm.state == RecoveryState.RECOVERING

    def test_postpone_intervention(self):
        sm = RecoveryStateMachine(session_id="test-session-3")
        decision = DecisionResult(
            action=DecisionAction.GENTLE_REMINDER,
            priority=DecisionPriority.LOW,
            reason_codes=["mild_drift"],
            explanation="Mild drift",
        )
        sm.present_intervention(decision)
        until = sm.postpone_intervention(minutes=10)
        assert sm.state == RecoveryState.POSTPONED
        assert sm.is_in_cooldown_or_break() is True

        # Check future timestamp
        now = datetime.now(timezone.utc)
        assert until > now

    def test_dismiss_intervention(self):
        sm = RecoveryStateMachine(session_id="test-session-4")
        decision = DecisionResult(
            action=DecisionAction.GENTLE_REMINDER,
            priority=DecisionPriority.LOW,
            reason_codes=["mild_drift"],
            explanation="Mild drift",
        )
        sm.present_intervention(decision)
        sm.dismiss_intervention()
        assert sm.state == RecoveryState.IN_SESSION
        assert sm.active_decision is None


# ---------------------------------------------------------------------------
# Test Transparent Personalization
# ---------------------------------------------------------------------------

class TestPersonalizationEngine:
    def test_repeated_dismissal_adaptation(self):
        engine = PersonalizationEngine()
        assert engine.profile.adaptive.cooldown_multiplier == 1.0

        # 1 dismissal -> 1.5x
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        assert engine.profile.outcomes.consecutive_dismissals == 1
        assert engine.profile.adaptive.cooldown_multiplier == 1.5

        # 2 dismissals -> 2.0x
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        assert engine.profile.outcomes.consecutive_dismissals == 2
        assert engine.profile.adaptive.cooldown_multiplier == 2.0
        assert "Reminder frequency reduced" in engine.profile.adaptive.explanation

        # 3 dismissals -> 2.5x
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        assert engine.profile.adaptive.cooldown_multiplier == 2.5

        # 4 dismissals -> 3.0x AND style steps down to MINIMAL
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        assert engine.profile.outcomes.consecutive_dismissals == 4
        assert engine.profile.adaptive.effective_preference == UserInterventionPreference.MINIMAL
        assert "stepped down to MINIMAL" in engine.profile.adaptive.explanation

    def test_acceptance_resets_dismissal_streak(self):
        engine = PersonalizationEngine()
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        assert engine.profile.outcomes.consecutive_dismissals == 3
        assert engine.profile.adaptive.cooldown_multiplier == 2.5

        # Acceptance immediately resets back-off
        engine.record_outcome(OutcomeType.ACCEPTED_INTERVENTION)
        assert engine.profile.outcomes.consecutive_dismissals == 0
        assert engine.profile.adaptive.cooldown_multiplier == 1.0
        assert engine.profile.adaptive.effective_preference == UserInterventionPreference.GENTLE

    def test_task_assistance_affinity_adaptation(self):
        engine = PersonalizationEngine()
        assert engine.profile.adaptive.prefers_task_assistance is False

        # User repeatedly requests task assistance
        engine.record_outcome(OutcomeType.REQUESTED_ASSISTANCE)
        engine.record_outcome(OutcomeType.REQUESTED_ASSISTANCE)
        assert engine.profile.outcomes.requested_assistance == 2
        assert engine.profile.adaptive.prefers_task_assistance is True
        assert "Task assistance prioritized" in engine.profile.adaptive.explanation

    def test_break_interval_adaptation(self):
        engine = PersonalizationEngine()
        assert engine.profile.adaptive.break_interval_minutes == 90

        # User requests breaks 3 times
        engine.record_outcome(OutcomeType.REQUESTED_BREAK)
        engine.record_outcome(OutcomeType.REQUESTED_BREAK)
        engine.record_outcome(OutcomeType.REQUESTED_BREAK)
        assert engine.profile.adaptive.break_interval_minutes == 60
        assert "Break suggestions scheduled at 60 minutes" in engine.profile.adaptive.explanation

    def test_preference_change(self):
        engine = PersonalizationEngine(base_preference=UserInterventionPreference.GENTLE)
        engine.set_base_preference(UserInterventionPreference.SILENT)
        assert engine.profile.base_preference == UserInterventionPreference.SILENT
        assert engine.profile.adaptive.effective_preference == UserInterventionPreference.SILENT

    def test_reset(self):
        engine = PersonalizationEngine()
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        engine.reset()
        assert engine.profile.outcomes.consecutive_dismissals == 0
        assert engine.profile.outcomes.total_interventions == 0
        assert engine.profile.adaptive.cooldown_multiplier == 1.0


# ---------------------------------------------------------------------------
# Test Decision Engine Integration with Personalization
# ---------------------------------------------------------------------------

class TestDecisionPersonalizationIntegration:
    def make_event(
        self,
        session_duration: float = 3700,
        app_duration: float = 150,
        app: str = "VS Code",
        state: AttentionState = AttentionState.POSSIBLY_DRIFTING,
    ) -> AttentionEvent:
        return AttentionEvent(
            eventId="ae-test-pers",
            timestamp="2026-10-24T12:00:00.000Z",
            attentionState=state,
            confidence=0.85,
            activeApp=ActiveApp(appName=app, windowTitle="Code", category="work"),
            metrics=AttentionMetrics(
                sessionDurationSeconds=session_duration,
                appDurationSeconds=app_duration,
                recentSwitchCount=4,
                inactivitySeconds=0,
            ),
            sources=["window_tracker"],
        )

    def test_decision_engine_adapts_cooldown_from_personalization(self):
        pers_engine = PersonalizationEngine()
        # 2 dismissals -> 2.0x cooldown
        pers_engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        pers_engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)

        decision_engine = InterventionDecisionEngine(personalization_engine=pers_engine)
        # Base cooldown is 180s; scaled 2.0x -> 360s
        effective_cd = decision_engine.get_effective_cooldown(DecisionAction.GENTLE_REMINDER)
        assert effective_cd == 360.0

    def test_decision_engine_prioritizes_task_assistance_when_preferred(self):
        pers_engine = PersonalizationEngine()
        pers_engine.record_outcome(OutcomeType.REQUESTED_ASSISTANCE)
        pers_engine.record_outcome(OutcomeType.REQUESTED_ASSISTANCE)

        decision_engine = InterventionDecisionEngine(personalization_engine=pers_engine)
        event = self.make_event(state=AttentionState.POSSIBLY_DRIFTING)
        assessment = AttentionAssessment(
            state=AttentionState.POSSIBLY_DRIFTING,
            score=0.60,
            confidence=0.80,
            reason_code=AttentionReasonCode.MODERATE_CONTEXT_SWITCHING,
            explanation="Drift observed",
            signal_breakdown={"composite_score": 0.60, "confidence": 0.80},
        )

        res = decision_engine.decide(assessment, event)
        # Should select TASK_ASSISTANCE instead of standard gentle reminder
        assert res.action == DecisionAction.TASK_ASSISTANCE
        assert "Personalized adaptation" in res.explanation

    def test_decision_engine_triggers_break_at_60_minutes_when_adapted(self):
        pers_engine = PersonalizationEngine()
        pers_engine.record_outcome(OutcomeType.REQUESTED_BREAK)
        pers_engine.record_outcome(OutcomeType.REQUESTED_BREAK)
        pers_engine.record_outcome(OutcomeType.REQUESTED_BREAK)
        assert pers_engine.profile.adaptive.break_interval_minutes == 60

        decision_engine = InterventionDecisionEngine(personalization_engine=pers_engine)
        # 65 minutes session (3900 seconds)
        event = self.make_event(
            session_duration=3900,
            state=AttentionState.FOCUSED,
        )
        assessment = AttentionAssessment(
            state=AttentionState.FOCUSED,
            score=0.90,
            confidence=0.95,
            reason_code=AttentionReasonCode.SUSTAINED_DEEP_FOCUS,
            explanation="Deep focus",
            signal_breakdown={"composite_score": 0.90, "confidence": 0.95},
        )

        res = decision_engine.decide(assessment, event)
        # Threshold adapted to 60m, so 65m triggers BREAK_SUGGESTION
        assert res.action == DecisionAction.BREAK_SUGGESTION


# ---------------------------------------------------------------------------
# Test Persistence & Privacy Behavior
# ---------------------------------------------------------------------------

class TestPersistenceAndPrivacy:
    def test_save_and_load_persistence(self, tmp_path: Path):
        filepath = tmp_path / "test_user_profile.json"
        engine = PersonalizationEngine(user_id="alice")
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        engine.record_outcome(OutcomeType.REQUESTED_ASSISTANCE)
        engine.record_outcome(OutcomeType.REQUESTED_ASSISTANCE)
        engine.save_to_file(filepath)

        assert filepath.is_file()

        # Load back
        loaded = PersonalizationEngine.load_from_file(filepath)
        assert loaded.profile.user_id == "alice"
        assert loaded.profile.outcomes.requested_assistance == 2
        assert loaded.profile.adaptive.prefers_task_assistance is True

    def test_load_missing_file_falls_back_to_defaults(self, tmp_path: Path):
        filepath = tmp_path / "non_existent_file.json"
        loaded = PersonalizationEngine.load_from_file(filepath)
        assert loaded.profile.user_id == "local_user"
        assert loaded.profile.outcomes.total_interventions == 0

    def test_load_corrupt_file_falls_back_to_defaults(self, tmp_path: Path):
        filepath = tmp_path / "corrupt_profile.json"
        filepath.write_text("NOT_VALID_JSON{{{", encoding="utf-8")
        loaded = PersonalizationEngine.load_from_file(filepath)
        assert loaded.profile.outcomes.total_interventions == 0

    def test_strict_privacy_audit(self):
        """Verifies that profile data contains zero sensitive activity logs or telemetry."""
        engine = PersonalizationEngine()
        engine.record_outcome(OutcomeType.DISMISSED_INTERVENTION)
        engine.record_outcome(OutcomeType.REQUESTED_BREAK)

        data = engine.to_dict()

        # Check keys in dictionary
        assert set(data.keys()) == {"user_id", "base_preference", "outcomes", "adaptive", "last_updated"}

        # Audit outcome keys: must only be aggregate integers
        for k, v in data["outcomes"].items():
            assert isinstance(v, int), f"Field {k} is not an integer!"

        # Explicitly ensure no sensitive tracking fields exist
        forbidden_substrings = [
            "webcam", "screenshot", "video", "frame", "camera", "url",
            "window_title", "keystroke", "process", "app_name", "raw",
        ]
        dump_str = json.dumps(data).lower()
        for forbidden in forbidden_substrings:
            assert forbidden not in dump_str, f"Found sensitive token '{forbidden}' in profile!"
