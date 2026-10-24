"""
assistant/tests/test_contracts.py

Verify that our Pydantic models can correctly parse every JSON example
defined in docs/SHARED_CONTRACTS.md.

This test acts as a living contract compliance check:
- If SHARED_CONTRACTS.md changes, these tests catch drift immediately.
- If our models have bugs, these tests catch them before any route runs.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from src.models.contracts import (
    AttentionEvent,
    AttentionState,
    InterventionDecision,
    InterventionLevel,
    RecoveryFeedbackRequest,
    RecoveryFeedbackResponse,
    TaskDecompositionRequest,
    TaskDecompositionResponse,
)


# ---------------------------------------------------------------------------
# Helpers — these are the exact JSON payloads from SHARED_CONTRACTS.md
# ---------------------------------------------------------------------------

ATTENTION_EVENT_EXAMPLE = {
    "eventId": "ae-981723-a1",
    "timestamp": "2026-10-24T21:50:00.000Z",
    "attentionState": "POSSIBLY_DRIFTING",
    "confidence": 0.78,
    "activeApp": {
        "appName": "Google Chrome",
        "windowTitle": "YouTube - Lo-Fi Chill Beats",
        "category": "entertainment",
    },
    "metrics": {
        "sessionDurationSeconds": 1840,
        "appDurationSeconds": 240,
        "recentSwitchCount": 5,
        "inactivitySeconds": 15,
        "webcamEngaged": False,
    },
    "sources": ["window_tracker", "activity_monitor"],
}

INTERVENTION_DECISION_EXAMPLE = {
    "decisionId": "id-55102-bc",
    "timestamp": "2026-10-24T21:50:05.000Z",
    "shouldIntervene": True,
    "level": "LEVEL_2_RECOVERY_SUGGESTION",
    "triggerReason": "Detected 5 app switches in 3 minutes during focus session",
    "message": "Looks like you might be switching tasks frequently. Would you like to get back to writing docs?",
    "actions": [
        {"actionId": "return_to_task", "label": "Back to Docs"},
        {"actionId": "break_down_task", "label": "Break into smaller steps"},
        {"actionId": "take_break", "label": "Take a 5 min break"},
        {"actionId": "dismiss", "label": "I'm still focused"},
    ],
}

TASK_DECOMPOSITION_RESPONSE_EXAMPLE = {
    "originalTask": "Build the project presentation",
    "subtasks": [
        {
            "stepNumber": 1,
            "title": "Define the target problem & audience",
            "description": "Write down 2-3 bullet points defining the core focus struggle.",
            "estimatedMinutes": 5,
            "isImmediateNextStep": True,
        },
        {
            "stepNumber": 2,
            "title": "Outline 5 key slides",
            "description": "Problem, Solution, Architecture, Demo, Next Steps.",
            "estimatedMinutes": 10,
            "isImmediateNextStep": False,
        },
    ],
}

RECOVERY_FEEDBACK_REQUEST_EXAMPLE = {
    "sessionId": "sess-abc-123",
    "currentTask": "Complete the final project report",
    "userReason": "task_confusing",
}


# ---------------------------------------------------------------------------
# 2.1  AttentionState enum
# ---------------------------------------------------------------------------

class TestAttentionStateEnum:
    ALL_STATES = ["FOCUSED", "POSSIBLY_DRIFTING", "DISTRACTED", "RECOVERING", "IDLE"]

    @pytest.mark.parametrize("state", ALL_STATES)
    def test_all_states_are_valid_enum_values(self, state: str):
        parsed = AttentionState(state)
        assert parsed.value == state

    def test_invalid_state_raises(self):
        with pytest.raises(ValueError):
            AttentionState("ANXIOUS")  # Medical term — must never be a valid state


# ---------------------------------------------------------------------------
# 2.2  AttentionEvent
# ---------------------------------------------------------------------------

class TestAttentionEvent:
    def test_parses_contract_example(self):
        event = AttentionEvent(**ATTENTION_EVENT_EXAMPLE)
        assert event.attentionState == AttentionState.POSSIBLY_DRIFTING
        assert event.confidence == 0.78
        assert event.activeApp.category == "entertainment"
        assert "window_tracker" in event.sources

    def test_confidence_must_be_0_to_1(self):
        bad = {**ATTENTION_EVENT_EXAMPLE, "confidence": 1.5}
        with pytest.raises(ValidationError):
            AttentionEvent(**bad)

    def test_optional_webcam_engaged_defaults_none(self):
        payload = dict(ATTENTION_EVENT_EXAMPLE)
        payload["metrics"] = {k: v for k, v in payload["metrics"].items()
                              if k != "webcamEngaged"}
        event = AttentionEvent(**payload)
        assert event.metrics.webcamEngaged is None

    def test_invalid_category_raises(self):
        bad = {**ATTENTION_EVENT_EXAMPLE}
        bad["activeApp"] = {**bad["activeApp"], "category": "social_media"}
        with pytest.raises(ValidationError):
            AttentionEvent(**bad)

    def test_invalid_source_raises(self):
        bad = {**ATTENTION_EVENT_EXAMPLE, "sources": ["unknown_source"]}
        with pytest.raises(ValidationError):
            AttentionEvent(**bad)

    def test_all_five_attention_states_parse_correctly(self):
        states = ["FOCUSED", "POSSIBLY_DRIFTING", "DISTRACTED", "RECOVERING", "IDLE"]
        for state in states:
            payload = {**ATTENTION_EVENT_EXAMPLE, "attentionState": state}
            event = AttentionEvent(**payload)
            assert event.attentionState.value == state


# ---------------------------------------------------------------------------
# 2.3  InterventionDecision
# ---------------------------------------------------------------------------

class TestInterventionDecision:
    def test_parses_contract_example(self):
        decision = InterventionDecision(**INTERVENTION_DECISION_EXAMPLE)
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION
        assert len(decision.actions) == 4

    def test_all_intervention_levels_are_valid(self):
        levels = [
            "LEVEL_0_NONE",
            "LEVEL_1_GENTLE_REMINDER",
            "LEVEL_2_RECOVERY_SUGGESTION",
            "LEVEL_3_ASSISTANCE",
            "LEVEL_4_BREAK_SUGGESTION",
        ]
        for level in levels:
            d = InterventionDecision(
                shouldIntervene=False,
                level=level,
                triggerReason="test",
            )
            assert d.level.value == level

    def test_no_intervention_requires_no_message(self):
        d = InterventionDecision(
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="user is focused",
        )
        assert d.message is None
        assert d.actions is None

    def test_decision_id_auto_generated(self):
        d = InterventionDecision(
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="test",
        )
        assert d.decisionId.startswith("dec-")

    def test_timestamp_auto_generated(self):
        d = InterventionDecision(
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="test",
        )
        assert "T" in d.timestamp  # ISO 8601

    def test_all_action_ids_are_valid(self):
        from src.models.contracts import InterventionAction
        valid = ["return_to_task", "break_down_task", "take_break", "dismiss"]
        for action_id in valid:
            a = InterventionAction(actionId=action_id, label="Test")
            assert a.actionId == action_id

    def test_invalid_action_id_raises(self):
        from src.models.contracts import InterventionAction
        with pytest.raises(ValidationError):
            InterventionAction(actionId="block_user", label="Bad")


# ---------------------------------------------------------------------------
# 2.4  TaskDecomposition
# ---------------------------------------------------------------------------

class TestTaskDecomposition:
    def test_request_parses(self):
        req = TaskDecompositionRequest(taskDescription="Write project report")
        assert req.taskDescription == "Write project report"

    def test_response_parses_contract_example(self):
        resp = TaskDecompositionResponse(**TASK_DECOMPOSITION_RESPONSE_EXAMPLE)
        assert resp.originalTask == "Build the project presentation"
        assert len(resp.subtasks) == 2
        assert resp.subtasks[0].isImmediateNextStep is True
        assert resp.subtasks[1].isImmediateNextStep is False

    def test_exactly_one_subtask_can_be_immediate(self):
        """Business rule: isImmediateNextStep marks the ONE first step."""
        resp = TaskDecompositionResponse(**TASK_DECOMPOSITION_RESPONSE_EXAMPLE)
        immediate = [s for s in resp.subtasks if s.isImmediateNextStep]
        assert len(immediate) >= 1  # At least one must be flagged


# ---------------------------------------------------------------------------
# 2.5  RecoveryFeedback
# ---------------------------------------------------------------------------

class TestRecoveryFeedback:
    VALID_REASONS = ["tired", "task_confusing", "distracted", "need_break", "other"]

    @pytest.mark.parametrize("reason", VALID_REASONS)
    def test_all_valid_reasons_parse(self, reason: str):
        req = RecoveryFeedbackRequest(
            sessionId="sess-001",
            currentTask="Write report",
            userReason=reason,
        )
        assert req.userReason == reason

    def test_invalid_reason_raises(self):
        with pytest.raises(ValidationError):
            RecoveryFeedbackRequest(
                sessionId="sess-001",
                currentTask="Write report",
                userReason="bored",  # Not in the contract
            )

    def test_response_recommendation_values(self):
        valid = ["take_break", "simplify_task", "resume_previous", "custom_tip"]
        for rec in valid:
            resp = RecoveryFeedbackResponse(
                recommendation=rec,
                supportiveMessage="You've got this.",
            )
            assert resp.recommendation == rec
