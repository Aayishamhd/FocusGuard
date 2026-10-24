"""
assistant/tests/test_decision_engine.py

Comprehensive tests for Stage 3 Intervention Decision Engine:
1. Focused -> NO_ACTION
2. Low-confidence drift -> NO_ACTION
3. Drift -> GENTLE_REMINDER
4. Strong drift -> RETURN_TO_TASK
5. Ambiguous task -> TASK_ASSISTANCE
6. Prolonged work -> BREAK_SUGGESTION
7. Recent intervention -> NO_ACTION (cooldown active)
8. Repeated dismissal -> reduced intervention (adaptive back-off)
9. Silent preference -> NO_ACTION
10. Minimal preference -> conservative behavior / least intrusive action
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from src.attention.reason_codes import AttentionReasonCode
from src.attention.state_engine import AttentionAssessment
from src.decision.decision_engine import InterventionDecisionEngine
from src.decision.models import (
    DecisionAction,
    DecisionPriority,
    UserInterventionPreference,
    UserResponseOutcome,
)
from src.models.contracts import (
    ActiveApp,
    AttentionEvent,
    AttentionMetrics,
    AttentionState,
)


def make_assessment(
    state: AttentionState,
    score: float = 0.85,
    confidence: float = 0.85,
    reason: AttentionReasonCode = AttentionReasonCode.STABLE_TASK_CONTEXT,
) -> AttentionAssessment:
    return AttentionAssessment(
        state=state,
        score=score,
        confidence=confidence,
        reason_code=reason,
        explanation=f"Assessment explanation for {state.value}",
        signal_breakdown={"composite_score": score, "confidence": confidence},
    )


def make_event(
    app: str = "VS Code",
    category: str = "work",
    app_duration: float = 300,
    session_duration: float = 1200,
    switch_count: int = 1,
    inactivity: float = 0,
) -> AttentionEvent:
    return AttentionEvent(
        eventId="ae-dec-test",
        timestamp="2026-10-24T12:00:00.000Z",
        attentionState=AttentionState.FOCUSED,
        confidence=0.85,
        activeApp=ActiveApp(
            appName=app,
            windowTitle=f"{app} - active window",
            category=category,  # type: ignore[arg-type]
        ),
        metrics=AttentionMetrics(
            sessionDurationSeconds=session_duration,
            appDurationSeconds=app_duration,
            recentSwitchCount=switch_count,
            inactivitySeconds=inactivity,
        ),
        sources=["window_tracker", "activity_monitor"],
    )


class TestInterventionDecisionEngine:
    def test_focused_no_action(self):
        """User is focused in normal session (<90m) -> NO_ACTION."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(AttentionState.FOCUSED)
        event = make_event(session_duration=1800)

        result = engine.decide(assessment, event)
        assert result.action == DecisionAction.NO_ACTION
        assert result.priority == DecisionPriority.NONE

    def test_low_confidence_drift_no_action(self):
        """Noisy or uncertain signal (confidence = 0.35) -> NO_ACTION."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(
            AttentionState.POSSIBLY_DRIFTING,
            confidence=0.35,
            reason=AttentionReasonCode.UNCERTAIN_CONTEXT,
        )
        event = make_event(app="Browser", category="entertainment")

        result = engine.decide(assessment, event)
        assert result.action == DecisionAction.NO_ACTION
        assert result.suppressed_by == "low_confidence"

    def test_mild_drift_gentle_reminder(self):
        """Early entertainment switch (<180s) -> least intrusive GENTLE_REMINDER."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(
            AttentionState.POSSIBLY_DRIFTING,
            confidence=0.80,
            reason=AttentionReasonCode.MILD_ATTENTION_DRIFT,
        )
        event = make_event(
            app="Chrome",
            category="entertainment",
            app_duration=45,
            switch_count=2,
        )

        result = engine.decide(assessment, event)
        assert result.action == DecisionAction.GENTLE_REMINDER
        assert result.priority == DecisionPriority.LOW

    def test_strong_drift_return_to_task(self):
        """Extended entertainment activity (>=180s on YouTube) -> RETURN_TO_TASK."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(
            AttentionState.DISTRACTED,
            confidence=0.88,
            reason=AttentionReasonCode.EXTENDED_UNRELATED_ACTIVITY,
        )
        event = make_event(
            app="YouTube",
            category="entertainment",
            app_duration=240,
            switch_count=6,
        )

        result = engine.decide(assessment, event)
        assert result.action == DecisionAction.RETURN_TO_TASK
        assert result.priority == DecisionPriority.MEDIUM

    def test_ambiguous_task_assistance(self):
        """User in work tool experiencing hesitation or stuck state -> TASK_ASSISTANCE."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(
            AttentionState.DISTRACTED,
            confidence=0.82,
            reason=AttentionReasonCode.EXTENDED_UNRELATED_ACTIVITY,
        )
        event = make_event(
            app="VS Code",
            category="work",
            app_duration=360,
        )

        result = engine.decide(assessment, event, current_task="Build Complex Parser")
        assert result.action == DecisionAction.TASK_ASSISTANCE
        assert result.priority == DecisionPriority.MEDIUM

    def test_prolonged_work_break_suggestion(self):
        """Focused session exceeding 90 minutes (5400s) -> BREAK_SUGGESTION."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(
            AttentionState.FOCUSED,
            reason=AttentionReasonCode.SUSTAINED_DEEP_FOCUS,
        )
        event = make_event(session_duration=5700)  # 95 minutes

        result = engine.decide(assessment, event)
        assert result.action == DecisionAction.BREAK_SUGGESTION
        assert result.priority == DecisionPriority.MEDIUM

    def test_recent_intervention_cooldown_suppression(self):
        """Second intervention triggered 30s after first -> suppressed by cooldown."""
        engine = InterventionDecisionEngine(base_cooldown_seconds=180)
        assessment = make_assessment(AttentionState.DISTRACTED)
        event = make_event(app="YouTube", category="entertainment", app_duration=200, switch_count=5)

        t0 = datetime(2026, 10, 24, 12, 0, 0, tzinfo=timezone.utc)
        # First decision: successfully triggers RETURN_TO_TASK
        res1 = engine.decide(assessment, event, now=t0)
        assert res1.action == DecisionAction.RETURN_TO_TASK

        # Second decision: 30 seconds later -> must be suppressed by cooldown
        t1 = t0 + timedelta(seconds=30)
        res2 = engine.decide(assessment, event, now=t1)
        assert res2.action == DecisionAction.NO_ACTION
        assert res2.suppressed_by == "cooldown"
        assert res2.cooldown_remaining_seconds > 0

    def test_repeated_dismissal_adaptive_backoff(self):
        """When user repeatedly dismisses interventions, gentle reminder is suppressed."""
        engine = InterventionDecisionEngine()
        # Simulate 2 previous dismissals
        engine.record_user_response(UserResponseOutcome.DISMISSED)
        engine.record_user_response(UserResponseOutcome.DISMISSED)
        assert engine.consecutive_dismissals == 2

        assessment = make_assessment(
            AttentionState.POSSIBLY_DRIFTING,
            confidence=0.80,
            reason=AttentionReasonCode.MILD_ATTENTION_DRIFT,
        )
        event = make_event(app="Chrome", category="entertainment", app_duration=30)

        # Candidate would have been GENTLE_REMINDER, but dismissal back-off suppresses it
        result = engine.decide(assessment, event)
        assert result.action == DecisionAction.NO_ACTION
        assert result.suppressed_by == "repeated_dismissal"

    def test_silent_preference_suppresses_everything(self):
        """User preference set to SILENT -> always NO_ACTION."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(AttentionState.DISTRACTED)
        event = make_event(app="YouTube", category="entertainment", app_duration=300)

        result = engine.decide(
            assessment,
            event,
            preference=UserInterventionPreference.SILENT,
        )
        assert result.action == DecisionAction.NO_ACTION
        assert result.suppressed_by == "silent_preference"

    def test_minimal_preference_conservative_behavior(self):
        """MINIMAL preference: downgrades RETURN_TO_TASK to least intrusive GENTLE_REMINDER."""
        engine = InterventionDecisionEngine()
        assessment = make_assessment(
            AttentionState.DISTRACTED,
            confidence=0.85,
        )
        event = make_event(app="YouTube", category="entertainment", app_duration=240, switch_count=5)

        result = engine.decide(
            assessment,
            event,
            preference=UserInterventionPreference.MINIMAL,
        )
        assert result.action == DecisionAction.GENTLE_REMINDER
        assert result.priority == DecisionPriority.LOW
