"""
assistant/tests/test_decompose.py

End-to-end HTTP tests for POST /api/decompose via FastAPI TestClient.
Verifies contract adherence, subtask numbering, and immediate next step guarantee.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.models.contracts import TaskDecompositionResponse


class TestDecomposeEndpoint:
    def test_decompose_standard_task(self, client: TestClient):
        payload = {
            "taskDescription": "Prepare slides for the engineering design review",
            "preferredStepCount": 3,
        }
        res = client.post("/api/decompose", json=payload)
        assert res.status_code == 200

        data = res.json()
        validated = TaskDecompositionResponse.model_validate(data)
        assert validated.originalTask == payload["taskDescription"]
        assert len(validated.subtasks) >= 2

        # Check immediate next step guarantee
        immediate_steps = [s for s in validated.subtasks if s.isImmediateNextStep]
        assert len(immediate_steps) == 1
        assert immediate_steps[0].stepNumber == 1

        # Check subtask properties
        for s in validated.subtasks:
            assert s.estimatedMinutes > 0
            assert len(s.title) > 0
            assert len(s.description) > 0

    def test_decompose_short_task(self, client: TestClient):
        payload = {
            "taskDescription": "Reply to client email",
        }
        res = client.post("/api/decompose", json=payload)
        assert res.status_code == 200
        validated = TaskDecompositionResponse.model_validate(res.json())
        assert len(validated.subtasks) >= 1
        assert validated.subtasks[0].isImmediateNextStep is True

    def test_decompose_missing_task_description(self, client: TestClient):
        # Empty body or missing field
        res = client.post("/api/decompose", json={})
        assert res.status_code == 422
