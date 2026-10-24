"""Automated tests for FastAPI endpoints (Port 5002) adhering to SHARED_CONTRACTS.md."""

from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from assistant.src.models import (
    HealthResponse,
    InterventionDecision,
    RecoveryFeedbackResponse,
    TaskDecompositionResponse,
)
from assistant.src.server import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_when_ollama_offline(self):
        """GET /health reports fallbackMode=True when Ollama is offline."""
        with patch("assistant.src.llm.ollama_client.OllamaClient.is_connected", return_value=False):
            resp = client.get("/health")
            assert resp.status_code == 200
            data = resp.json()
            HealthResponse(**data)  # Validate schema
            assert data["status"] == "ok"
            assert data["llmConnected"] is False
            assert data["fallbackMode"] is True
            assert "llama3.2" in data["model"]

    def test_health_when_ollama_online(self):
        """GET /health reports fallbackMode=False when Ollama is online."""
        with patch("assistant.src.llm.ollama_client.OllamaClient.is_connected", return_value=True):
            resp = client.get("/health")
            assert resp.status_code == 200
            data = resp.json()
            HealthResponse(**data)
            assert data["llmConnected"] is True
            assert data["fallbackMode"] is False


class TestInterveneEndpoint:
    def test_intervene_stable_work_level_0(self):
        """POST /api/intervene for focused work returns LEVEL_0_NONE."""
        payload = {
            "eventId": "ae-001",
            "timestamp": "2026-10-24T22:00:00.000Z",
            "attentionState": "FOCUSED",
            "confidence": 0.95,
            "activeApp": {
                "appName": "Visual Studio Code",
                "windowTitle": "server.py",
                "category": "work",
            },
            "metrics": {
                "sessionDurationSeconds": 1800,
                "appDurationSeconds": 400,
                "recentSwitchCount": 1,
                "inactivitySeconds": 5,
                "webcamEngaged": True,
            },
            "sources": ["window_tracker", "activity_monitor"],
        }
        resp = client.post("/api/intervene", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        decision = InterventionDecision(**data)
        assert decision.shouldIntervene is False
        assert decision.level.value == "LEVEL_0_NONE"
        assert decision.message is None

    def test_intervene_distraction_level_2(self):
        """POST /api/intervene for entertainment app returns LEVEL_2_RECOVERY_SUGGESTION."""
        payload = {
            "eventId": "ae-002",
            "timestamp": "2026-10-24T22:05:00.000Z",
            "attentionState": "DISTRACTED",
            "confidence": 0.88,
            "activeApp": {
                "appName": "YouTube",
                "windowTitle": "Cat Videos",
                "category": "entertainment",
            },
            "metrics": {
                "sessionDurationSeconds": 2400,
                "appDurationSeconds": 300,
                "recentSwitchCount": 5,
                "inactivitySeconds": 20,
            },
            "sources": ["window_tracker"],
        }
        resp = client.post("/api/intervene", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        decision = InterventionDecision(**data)
        assert decision.shouldIntervene is True
        assert decision.level.value == "LEVEL_2_RECOVERY_SUGGESTION"
        assert decision.message is not None
        assert decision.actions is not None
        assert len(decision.actions) >= 1

    def test_intervene_break_suggestion_level_4(self):
        """POST /api/intervene for >90m session returns LEVEL_4_BREAK_SUGGESTION."""
        payload = {
            "eventId": "ae-003",
            "timestamp": "2026-10-24T22:10:00.000Z",
            "attentionState": "FOCUSED",
            "confidence": 0.90,
            "activeApp": {
                "appName": "VS Code",
                "windowTitle": "main.py",
                "category": "work",
            },
            "metrics": {
                "sessionDurationSeconds": 5600,  # > 90 mins
                "appDurationSeconds": 1800,
                "recentSwitchCount": 1,
                "inactivitySeconds": 5,
            },
            "sources": ["window_tracker"],
        }
        resp = client.post("/api/intervene", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        decision = InterventionDecision(**data)
        assert decision.shouldIntervene is True
        assert decision.level.value == "LEVEL_4_BREAK_SUGGESTION"
        assert decision.suggestedBreakMinutes == 5

    def test_intervene_malformed_payload_returns_422(self):
        """POST /api/intervene with missing required fields returns 422."""
        payload = {"eventId": "ae-invalid"}
        resp = client.post("/api/intervene", json=payload)
        assert resp.status_code == 422
        err = resp.json()
        assert "error" in err or "details" in err


class TestDecomposeEndpoint:
    def test_decompose_valid_request(self):
        """POST /api/decompose returns structured subtasks with immediate next step."""
        payload = {
            "taskDescription": "Prepare final slide deck for demonstration",
            "difficultyLevel": "moderate",
        }
        resp = client.post("/api/decompose", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        decomp = TaskDecompositionResponse(**data)
        assert decomp.originalTask == "Prepare final slide deck for demonstration"
        assert len(decomp.subtasks) >= 3

        # Sequential numbering
        for idx, st in enumerate(decomp.subtasks):
            assert st.stepNumber == idx + 1
            assert st.estimatedMinutes > 0

        # Exactly one immediate next step
        immediate = [st for st in decomp.subtasks if st.isImmediateNextStep]
        assert len(immediate) == 1

    def test_decompose_empty_task_returns_422(self):
        """Empty or whitespace-only task description is rejected with 422."""
        payload = {"taskDescription": "   "}
        resp = client.post("/api/decompose", json=payload)
        assert resp.status_code == 422

    def test_decompose_oversized_task_returns_400(self):
        """Task description exceeding length limit returns 400."""
        payload = {"taskDescription": "A" * 600}
        resp = client.post("/api/decompose", json=payload)
        assert resp.status_code == 400
        data = resp.json()
        assert "exceeds maximum" in data.get("error", "").lower()


class TestRecoverEndpoint:
    @pytest.mark.parametrize("reason", ["tired", "task_confusing", "distracted", "need_break", "other"])
    def test_recover_all_user_reasons(self, reason: str):
        """POST /api/recover handles all contract-supported user reasons."""
        payload = {
            "sessionId": "sess-test-01",
            "currentTask": "Refactor database models",
            "userReason": reason,
            "notes": "Testing recovery flow",
        }
        resp = client.post("/api/recover", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        recovery = RecoveryFeedbackResponse(**data)
        assert recovery.recommendation.value in [
            "take_break",
            "simplify_task",
            "resume_previous",
            "custom_tip",
        ]
        assert len(recovery.supportiveMessage) > 0

    def test_recover_invalid_reason_returns_422(self):
        """Unknown recovery reason returns 422 validation error."""
        payload = {
            "sessionId": "sess-test-01",
            "currentTask": "Coding",
            "userReason": "invalid_reason_value",
        }
        resp = client.post("/api/recover", json=payload)
        assert resp.status_code == 422
