"""
assistant/tests/test_recover.py

End-to-end HTTP tests for POST /api/recover via FastAPI TestClient.
Verifies contract adherence for all recovery reasons and supportive tone.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.models.contracts import RecoveryFeedbackResponse


class TestRecoverEndpoint:
    @pytest.mark.parametrize("reason", [
        "tired",
        "task_confusing",
        "distracted",
        "need_break",
        "other",
    ])
    def test_recover_all_valid_reasons(self, client: TestClient, reason: str):
        payload = {
            "sessionId": "sess-test-rec",
            "currentTask": "Refactoring data pipeline",
            "userReason": reason,
            "notes": "Feeling like taking a pause.",
        }
        res = client.post("/api/recover", json=payload)
        assert res.status_code == 200

        data = res.json()
        validated = RecoveryFeedbackResponse.model_validate(data)
        assert validated.recommendation in [
            "take_break",
            "simplify_task",
            "resume_previous",
            "custom_tip",
        ]
        assert len(validated.supportiveMessage) > 10

    def test_recover_without_optional_notes(self, client: TestClient):
        payload = {
            "sessionId": "sess-test-rec",
            "currentTask": "Reading codebase",
            "userReason": "tired",
        }
        res = client.post("/api/recover", json=payload)
        assert res.status_code == 200
        validated = RecoveryFeedbackResponse.model_validate(res.json())
        assert validated.recommendation == "take_break"

    def test_recover_invalid_reason(self, client: TestClient):
        payload = {
            "sessionId": "sess-test-rec",
            "currentTask": "Reading codebase",
            "userReason": "alien_invasion",
        }
        res = client.post("/api/recover", json=payload)
        assert res.status_code == 422
