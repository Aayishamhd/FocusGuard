"""
assistant/tests/test_intervention.py

End-to-end tests for POST /api/intervene via FastAPI TestClient.

Sends sample AttentionEvents (from mocks/sample_events.json) through the
full HTTP stack and asserts that:
- HTTP 200 is returned
- Response body is valid JSON
- Response conforms to the InterventionDecision contract schema
- Business logic is correct per scenario
"""

from __future__ import annotations

import pytest

from src.models.contracts import InterventionDecision, InterventionLevel
from tests.conftest import strip_meta


class TestInterventionRoute:

    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "llmConnected" in body
        assert "model" in body
        assert "fallbackMode" in body

    @pytest.mark.parametrize("scenario", [
        "focused",
        "focused-long",
        "possibly-drifting",
        "distracted",
        "recovering",
        "idle",
    ])
    def test_all_scenarios_return_200(self, client, event_by_scenario, scenario):
        event = strip_meta(event_by_scenario[scenario])
        r = client.post("/api/intervene", json=event)
        assert r.status_code == 200, f"Scenario '{scenario}' returned {r.status_code}: {r.text}"

    @pytest.mark.parametrize("scenario", [
        "focused",
        "focused-long",
        "possibly-drifting",
        "distracted",
        "recovering",
        "idle",
    ])
    def test_all_scenarios_return_valid_contract(self, client, event_by_scenario, scenario):
        """Response must be parseable by our Pydantic model."""
        event = strip_meta(event_by_scenario[scenario])
        r = client.post("/api/intervene", json=event)
        assert r.status_code == 200
        # Will raise ValidationError if schema is broken
        decision = InterventionDecision(**r.json())
        assert decision.decisionId is not None
        assert decision.timestamp is not None
        assert isinstance(decision.shouldIntervene, bool)

    def test_focused_no_intervention(self, client, event_by_scenario):
        event = strip_meta(event_by_scenario["focused"])
        r = client.post("/api/intervene", json=event)
        decision = InterventionDecision(**r.json())
        assert decision.shouldIntervene is False
        assert decision.level == InterventionLevel.LEVEL_0_NONE

    def test_focused_long_suggests_break(self, client, event_by_scenario):
        event = strip_meta(event_by_scenario["focused-long"])
        r = client.post("/api/intervene", json=event)
        decision = InterventionDecision(**r.json())
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_4_BREAK_SUGGESTION
        assert decision.suggestedBreakMinutes is not None

    def test_distracted_suggests_recovery(self, client, event_by_scenario):
        event = strip_meta(event_by_scenario["distracted"])
        r = client.post("/api/intervene", json=event)
        decision = InterventionDecision(**r.json())
        assert decision.shouldIntervene is True
        assert decision.level in (
            InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
            InterventionLevel.LEVEL_3_ASSISTANCE,
        )

    def test_recovering_no_interrupt(self, client, event_by_scenario):
        event = strip_meta(event_by_scenario["recovering"])
        r = client.post("/api/intervene", json=event)
        decision = InterventionDecision(**r.json())
        assert decision.shouldIntervene is False

    def test_invalid_event_returns_422(self, client):
        """Pydantic should reject malformed bodies with 422 Unprocessable Entity."""
        r = client.post("/api/intervene", json={"broken": "payload"})
        assert r.status_code == 422

    def test_invalid_attention_state_returns_422(self, client, event_by_scenario):
        event = strip_meta(event_by_scenario["focused"])
        event["attentionState"] = "ANXIOUS"  # Invalid state
        r = client.post("/api/intervene", json=event)
        assert r.status_code == 422

    def test_confidence_out_of_range_returns_422(self, client, event_by_scenario):
        event = strip_meta(event_by_scenario["focused"])
        event["confidence"] = 1.5  # Must be 0.0–1.0
        r = client.post("/api/intervene", json=event)
        assert r.status_code == 422


class TestDecomposeRoute:

    def test_basic_task_returns_200(self, client):
        r = client.post(
            "/api/decompose",
            json={"taskDescription": "Build the project presentation"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "subtasks" in body
        assert len(body["subtasks"]) >= 1

    def test_response_matches_contract(self, client):
        from src.models.contracts import TaskDecompositionResponse
        r = client.post(
            "/api/decompose",
            json={"taskDescription": "Write and review the API documentation"},
        )
        assert r.status_code == 200
        resp = TaskDecompositionResponse(**r.json())
        assert len(resp.subtasks) >= 1
        immediate = [s for s in resp.subtasks if s.isImmediateNextStep]
        assert len(immediate) >= 1

    def test_missing_task_description_returns_422(self, client):
        r = client.post("/api/decompose", json={})
        assert r.status_code == 422


class TestRecoverRoute:

    @pytest.mark.parametrize("reason", [
        "tired", "task_confusing", "distracted", "need_break", "other"
    ])
    def test_all_reasons_return_200(self, client, reason):
        r = client.post(
            "/api/recover",
            json={
                "sessionId": "sess-test-001",
                "currentTask": "Write the report",
                "userReason": reason,
            },
        )
        assert r.status_code == 200

    def test_response_matches_contract(self, client):
        from src.models.contracts import RecoveryFeedbackResponse
        r = client.post(
            "/api/recover",
            json={
                "sessionId": "sess-test-001",
                "currentTask": "Write the report",
                "userReason": "tired",
            },
        )
        assert r.status_code == 200
        resp = RecoveryFeedbackResponse(**r.json())
        assert resp.supportiveMessage
        assert resp.recommendation == "take_break"

    def test_invalid_reason_returns_422(self, client):
        r = client.post(
            "/api/recover",
            json={
                "sessionId": "s1",
                "currentTask": "t",
                "userReason": "bored",  # Not in the contract
            },
        )
        assert r.status_code == 422
