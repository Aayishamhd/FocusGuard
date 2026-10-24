"""
assistant/tests/test_prompts.py

Tests for prompt engineering templates:
1. Intervention prompt structure and non-shaming guidelines
2. Task decomposition prompt structure and difficulty handling
3. Recovery coaching prompt structure and empathetic framing
"""

from __future__ import annotations

from src.models.contracts import (
    ActiveApp,
    AttentionEvent,
    AttentionMetrics,
    AttentionState,
    RecoveryFeedbackRequest,
    TaskDecompositionRequest,
)
from src.prompts.intervention import build_intervention_prompt
from src.prompts.recovery import build_recovery_prompt
from src.prompts.task_decomposition import build_task_decomposition_prompt


class TestPromptTemplates:
    def test_intervention_prompt_content(self):
        event = AttentionEvent(
            eventId="ae-test-01",
            timestamp="2026-10-24T12:00:00.000Z",
            attentionState=AttentionState.DISTRACTED,
            confidence=0.88,
            activeApp=ActiveApp(appName="YouTube", windowTitle="Funny cats", category="entertainment"),
            metrics=AttentionMetrics(
                sessionDurationSeconds=1200,
                appDurationSeconds=300,
                recentSwitchCount=8,
                inactivitySeconds=5,
            ),
            sources=["window_tracker", "activity_monitor"],
        )
        system, user = build_intervention_prompt(event)
        assert "FocusGuard" in system
        assert "NEVER shame" in system
        assert "ae-test-01" in user
        assert "YouTube" in user
        assert "DISTRACTED" in user

    def test_task_decomposition_prompt(self):
        req = TaskDecompositionRequest(
            taskDescription="Draft architecture documentation for the team",
            difficultyLevel="moderate",
            existingSubtasks=["Read overview doc"],
        )
        system, user = build_task_decomposition_prompt(req)
        assert "decomposition specialist" in system
        assert "Draft architecture documentation" in user
        assert "Read overview doc" in user

    def test_recovery_prompt(self):
        req = RecoveryFeedbackRequest(
            sessionId="sess-prompt-01",
            currentTask="Writing unit tests",
            userReason="tired",
            notes="Stared at screen for 4 hours without break",
        )
        system, user = build_recovery_prompt(req)
        assert "recovery coach" in system
        assert "Writing unit tests" in user
        assert "tired" in user
        assert "Stared at screen for 4 hours" in user
