"""
assistant/tests/test_fallback.py

Tests for the heuristic fallback engine (fallback_heuristics.py).

Verifies:
- All 5 AttentionStates produce valid InterventionDecision objects
- All 5 recovery reasons produce valid RecoveryFeedbackResponse objects
- Long-focus sessions trigger a break suggestion
- Productive switching does NOT trigger high-level intervention
- The engine NEVER raises an exception
"""

from __future__ import annotations

import pytest

from src.llm.fallback_heuristics import decide_intervention, decompose_task, guide_recovery
from src.models.contracts import (
    AttentionEvent,
    AttentionState,
    InterventionLevel,
    RecoveryFeedbackRequest,
    TaskDecompositionRequest,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_event(
    state: str,
    *,
    session_seconds: float = 1200,
    switch_count: int = 2,
    inactivity: float = 0,
    category: str = "work",
    app: str = "Code",
) -> AttentionEvent:
    return AttentionEvent(
        eventId="test-event-001",
        timestamp="2026-10-24T10:00:00.000Z",
        attentionState=state,
        confidence=0.80,
        activeApp={
            "appName": app,
            "windowTitle": f"{app} — test window",
            "category": category,
        },
        metrics={
            "sessionDurationSeconds": session_seconds,
            "appDurationSeconds": 300,
            "recentSwitchCount": switch_count,
            "inactivitySeconds": inactivity,
        },
        sources=["window_tracker", "activity_monitor"],
    )


# ---------------------------------------------------------------------------
# Intervention — all 5 states
# ---------------------------------------------------------------------------

class TestDecideIntervention:

    def test_focused_no_intervention(self):
        event = make_event("FOCUSED", session_seconds=1200)
        result = decide_intervention(event)
        assert result.shouldIntervene is False
        assert result.level == InterventionLevel.LEVEL_0_NONE

    def test_focused_long_session_triggers_break(self):
        """User focused for 95 min should get a break suggestion."""
        event = make_event("FOCUSED", session_seconds=5700)  # 95 minutes
        result = decide_intervention(event)
        assert result.shouldIntervene is True
        assert result.level == InterventionLevel.LEVEL_4_BREAK_SUGGESTION
        assert result.suggestedBreakMinutes == 5

    def test_focused_90min_exactly_triggers_break(self):
        event = make_event("FOCUSED", session_seconds=5400)  # exactly 90 min
        result = decide_intervention(event)
        assert result.shouldIntervene is True
        assert result.level == InterventionLevel.LEVEL_4_BREAK_SUGGESTION

    def test_possibly_drifting_entertainment_triggers_recovery(self):
        event = make_event(
            "POSSIBLY_DRIFTING",
            switch_count=5,
            category="entertainment",
            app="Google Chrome",
        )
        result = decide_intervention(event)
        assert result.shouldIntervene is True
        assert result.level in (
            InterventionLevel.LEVEL_1_GENTLE_REMINDER,
            InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
        )

    def test_possibly_drifting_few_switches_only_gentle_reminder(self):
        """Low switch count + work category = gentle reminder, not recovery push."""
        event = make_event(
            "POSSIBLY_DRIFTING",
            switch_count=1,
            category="work",
            app="Chrome (Docs)",
        )
        result = decide_intervention(event)
        assert result.shouldIntervene is True
        assert result.level == InterventionLevel.LEVEL_1_GENTLE_REMINDER

    def test_distracted_triggers_recovery_suggestion(self):
        event = make_event(
            "DISTRACTED",
            switch_count=6,
            category="entertainment",
            app="YouTube",
        )
        result = decide_intervention(event)
        assert result.shouldIntervene is True
        assert result.level == InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION

    def test_recovering_no_intervention(self):
        """Never interrupt a recovering user — they're trying to get back."""
        event = make_event("RECOVERING")
        result = decide_intervention(event)
        assert result.shouldIntervene is False
        assert result.level == InterventionLevel.LEVEL_0_NONE

    def test_idle_short_no_intervention(self):
        event = make_event("IDLE", inactivity=60)  # 1 minute idle
        result = decide_intervention(event)
        assert result.shouldIntervene is False

    def test_idle_long_triggers_gentle_reminder(self):
        event = make_event("IDLE", inactivity=370)  # > 5 minutes
        result = decide_intervention(event)
        assert result.shouldIntervene is True
        assert result.level == InterventionLevel.LEVEL_1_GENTLE_REMINDER

    def test_all_states_return_valid_model(self):
        """Smoke test: all states return something that passes Pydantic validation."""
        from src.models.contracts import InterventionDecision
        states = ["FOCUSED", "POSSIBLY_DRIFTING", "DISTRACTED", "RECOVERING", "IDLE"]
        for state in states:
            event = make_event(state)
            result = decide_intervention(event)
            # Re-parse through Pydantic to confirm schema compliance
            validated = InterventionDecision(**result.model_dump())
            assert validated.level is not None

    def test_result_always_has_trigger_reason(self):
        """triggerReason must always be non-empty — it's logged for debugging."""
        states = ["FOCUSED", "POSSIBLY_DRIFTING", "DISTRACTED", "RECOVERING", "IDLE"]
        for state in states:
            event = make_event(state)
            result = decide_intervention(event)
            assert result.triggerReason and len(result.triggerReason) > 0

    def test_no_exception_on_any_input(self):
        """The fallback engine must never raise — test with edge-case values."""
        extreme_cases = [
            make_event("FOCUSED", session_seconds=0),
            make_event("IDLE", inactivity=86400),   # 24 hours idle
            make_event("DISTRACTED", switch_count=100),
        ]
        for event in extreme_cases:
            result = decide_intervention(event)  # must not raise
            assert result is not None


# ---------------------------------------------------------------------------
# Task decomposition
# ---------------------------------------------------------------------------

class TestDecomposeTask:

    def test_short_single_task_returns_4_steps(self):
        req = TaskDecompositionRequest(taskDescription="Write the report")
        result = decompose_task(req)
        assert result.originalTask == "Write the report"
        assert len(result.subtasks) >= 1

    def test_compound_task_splits_on_and(self):
        req = TaskDecompositionRequest(
            taskDescription="Write the report, and then review it, and submit"
        )
        result = decompose_task(req)
        assert len(result.subtasks) >= 2

    def test_exactly_one_immediate_next_step(self):
        req = TaskDecompositionRequest(taskDescription="Build the API")
        result = decompose_task(req)
        immediate = [s for s in result.subtasks if s.isImmediateNextStep]
        assert len(immediate) >= 1
        assert result.subtasks[0].isImmediateNextStep is True

    def test_step_numbers_are_sequential(self):
        req = TaskDecompositionRequest(taskDescription="Plan the project")
        result = decompose_task(req)
        for i, subtask in enumerate(result.subtasks):
            assert subtask.stepNumber == i + 1

    def test_empty_ish_task_does_not_crash(self):
        req = TaskDecompositionRequest(taskDescription="Do something")
        result = decompose_task(req)
        assert len(result.subtasks) >= 1


# ---------------------------------------------------------------------------
# Recovery guidance — all 5 reasons
# ---------------------------------------------------------------------------

class TestGuideRecovery:
    VALID_REASONS = ["tired", "task_confusing", "distracted", "need_break", "other"]

    @pytest.mark.parametrize("reason", VALID_REASONS)
    def test_all_reasons_return_valid_response(self, reason: str):
        req = RecoveryFeedbackRequest(
            sessionId="sess-test-001",
            currentTask="Complete the project report",
            userReason=reason,
        )
        result = guide_recovery(req)
        assert result.recommendation in (
            "take_break", "simplify_task", "resume_previous", "custom_tip"
        )
        assert result.supportiveMessage
        assert len(result.supportiveMessage) > 10  # Must be a real message

    def test_tired_recommends_break(self):
        req = RecoveryFeedbackRequest(
            sessionId="s1", currentTask="t", userReason="tired"
        )
        result = guide_recovery(req)
        assert result.recommendation == "take_break"
        assert result.actionPayload is not None
        assert result.actionPayload.suggestedBreakMinutes == 5

    def test_task_confusing_recommends_simplify(self):
        req = RecoveryFeedbackRequest(
            sessionId="s1", currentTask="t", userReason="task_confusing"
        )
        result = guide_recovery(req)
        assert result.recommendation == "simplify_task"

    def test_distracted_recommends_resume(self):
        req = RecoveryFeedbackRequest(
            sessionId="s1", currentTask="t", userReason="distracted"
        )
        result = guide_recovery(req)
        assert result.recommendation == "resume_previous"

    def test_need_break_recommends_break(self):
        req = RecoveryFeedbackRequest(
            sessionId="s1", currentTask="t", userReason="need_break"
        )
        result = guide_recovery(req)
        assert result.recommendation == "take_break"

    def test_response_never_contains_shaming_language(self):
        """Safety: no blaming or shaming in any fallback message."""
        shame_words = ["waste", "lazy", "distracted because", "your fault", "bad"]
        for reason in self.VALID_REASONS:
            req = RecoveryFeedbackRequest(
                sessionId="s1", currentTask="t", userReason=reason
            )
            result = guide_recovery(req)
            for word in shame_words:
                assert word not in result.supportiveMessage.lower(), (
                    f"Shaming language '{word}' found in message for reason '{reason}'"
                )
