"""
assistant/tests/test_generation_service.py

Comprehensive tests for Stage 4 LLM Generation Service and Prompt Architecture:
1. Valid generation matching deterministic action
2. Malformed JSON output triggers deterministic fallback
3. Timeout / exception handling triggers fallback
4. Unavailable Ollama model triggers fallback
5. Action mismatch (LLM action hallucination) rejected & overridden by fallback
6. Empty response handling
7. Task assistance generation with micro-step next step
8. Break suggestion generation with suggested duration
9. Supportive language & safety filtering (anti-shaming, non-diagnostic)
10. Autonomy constraint: NO_ACTION bypasses LLM entirely
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.attention.reason_codes import AttentionReasonCode
from src.attention.state_engine import AttentionAssessment
from src.decision.models import DecisionAction, DecisionPriority, DecisionResult
from src.llm.generation_service import GenerationService
from src.llm.schemas import LLMInterventionOutput
from src.models.contracts import (
    ActiveApp,
    AttentionEvent,
    AttentionMetrics,
    AttentionState,
)


def make_context(
    action: DecisionAction = DecisionAction.RETURN_TO_TASK,
    state: AttentionState = AttentionState.DISTRACTED,
    app: str = "YouTube",
    category: str = "entertainment",
    task: str | None = "Implement Core Parser",
    session_duration: float = 1800,
    app_duration: float = 240,
) -> tuple[DecisionResult, AttentionAssessment, AttentionEvent]:
    decision = DecisionResult(
        action=action,
        priority=DecisionPriority.MEDIUM,
        reason_codes=["extended_unrelated_activity"],
        explanation="Extended activity on entertainment app.",
    )
    assessment = AttentionAssessment(
        state=state,
        score=0.30,
        confidence=0.85,
        reason_code=AttentionReasonCode.EXTENDED_UNRELATED_ACTIVITY,
        explanation="Assessment rationale",
        signal_breakdown={"composite_score": 0.30, "confidence": 0.85},
    )
    event = AttentionEvent(
        eventId="ae-test-gen",
        timestamp="2026-10-24T12:00:00.000Z",
        attentionState=state,
        confidence=0.85,
        activeApp=ActiveApp(
            appName=app,
            windowTitle=f"{app} - test window",
            category=category,  # type: ignore[arg-type]
        ),
        metrics=AttentionMetrics(
            sessionDurationSeconds=session_duration,
            appDurationSeconds=app_duration,
            recentSwitchCount=4,
            inactivitySeconds=0,
        ),
        sources=["window_tracker", "activity_monitor"],
    )
    return decision, assessment, event


class TestGenerationService:
    @pytest.mark.asyncio
    async def test_valid_generation_success(self):
        """Mocked valid LLM JSON matching the deterministic action."""
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.RETURN_TO_TASK)

        mock_llm_payload = {
            "message": "Notice your focus may have shifted. Ready to return to your code?",
            "action": "RETURN_TO_TASK",
            "next_step": None,
            "suggested_break_minutes": None,
        }

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value=json.dumps(mock_llm_payload))):
                res = await service.generate_intervention_copy(decision, assessment, event, current_task="Coding")
                assert res.action == DecisionAction.RETURN_TO_TASK
                assert "focus may have shifted" in res.message
                assert res.next_step is None

    @pytest.mark.asyncio
    async def test_malformed_json_triggers_fallback(self):
        """Malformed text from LLM triggers deterministic fallback cleanly."""
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.RETURN_TO_TASK)

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value="NOT_JSON_AT_ALL")):
                res = await service.generate_intervention_copy(decision, assessment, event, current_task="Build parser")
                assert res.action == DecisionAction.RETURN_TO_TASK
                # Confirms fallback message was substituted
                assert "Ready to return" in res.message

    @pytest.mark.asyncio
    async def test_timeout_triggers_fallback(self):
        """Ollama timeout returns None -> triggers deterministic fallback."""
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.GENTLE_REMINDER)

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value=None)):
                res = await service.generate_intervention_copy(decision, assessment, event)
                assert res.action == DecisionAction.GENTLE_REMINDER
                assert "attention may have shifted" in res.message

    @pytest.mark.asyncio
    async def test_unavailable_model_triggers_fallback(self):
        """When Ollama is offline (is_available=False), fallback runs instantly."""
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.BREAK_SUGGESTION, session_duration=5700)

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=False)):
            res = await service.generate_intervention_copy(decision, assessment, event)
            assert res.action == DecisionAction.BREAK_SUGGESTION
            assert res.suggested_break_minutes == 5
            assert "95 minutes" in res.message or "break" in res.message

    @pytest.mark.asyncio
    async def test_action_mismatch_rejected_and_fallback_used(self):
        """
        ACTION CONSISTENCY GUARD:
        Deterministic decision is RETURN_TO_TASK, but LLM hallucinates BREAK_SUGGESTION.
        The system must REJECT the LLM response and substitute the deterministic fallback.
        """
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.RETURN_TO_TASK)

        hallucinated_payload = {
            "message": "Take a 20-minute break now!",
            "action": "BREAK_SUGGESTION",
            "next_step": None,
            "suggested_break_minutes": 20,
        }

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value=json.dumps(hallucinated_payload))):
                res = await service.generate_intervention_copy(decision, assessment, event, current_task="Coding")
                # Action must remain RETURN_TO_TASK, NOT BREAK_SUGGESTION
                assert res.action == DecisionAction.RETURN_TO_TASK
                assert "Ready to return" in res.message

    @pytest.mark.asyncio
    async def test_empty_response_triggers_fallback(self):
        """Empty whitespace string from LLM triggers fallback."""
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.GENTLE_REMINDER)

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value="   ")):
                res = await service.generate_intervention_copy(decision, assessment, event)
                assert res.action == DecisionAction.GENTLE_REMINDER
                assert "attention may have shifted" in res.message

    @pytest.mark.asyncio
    async def test_task_assistance_structured_output(self):
        """Task assistance includes a concrete next step."""
        service = GenerationService()
        decision, assessment, event = make_context(
            action=DecisionAction.TASK_ASSISTANCE,
            state=AttentionState.DISTRACTED,
            app="VS Code",
            category="work",
        )

        llm_payload = {
            "message": "This task seems complex. Let's start with a small, concrete step.",
            "action": "TASK_ASSISTANCE",
            "next_step": "Create the test_parser.py file and stub the first test.",
            "suggested_break_minutes": None,
        }

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value=json.dumps(llm_payload))):
                res = await service.generate_intervention_copy(decision, assessment, event, current_task="Build Parser")
                assert res.action == DecisionAction.TASK_ASSISTANCE
                assert res.next_step == "Create the test_parser.py file and stub the first test."
                assert "complex" in res.message

    @pytest.mark.asyncio
    async def test_supportive_language_and_safety_filtering(self):
        """Even if the LLM output contains shaming language, safety filter sanitizes it."""
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.RETURN_TO_TASK)

        unsafe_payload = {
            "message": "Stop being lazy and stop wasting time on YouTube.",
            "action": "RETURN_TO_TASK",
            "next_step": None,
            "suggested_break_minutes": None,
        }

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value=json.dumps(unsafe_payload))):
                res = await service.generate_intervention_copy(decision, assessment, event)
                assert res.action == DecisionAction.RETURN_TO_TASK
                # Shaming language must be sanitized!
                assert "lazy" not in res.message.lower()
                assert "wasting time" not in res.message.lower()

    @pytest.mark.asyncio
    async def test_no_action_bypasses_llm_entirely(self):
        """Autonomy & Efficiency: NO_ACTION returns immediately without invoking LLM."""
        service = GenerationService()
        decision, assessment, event = make_context(action=DecisionAction.NO_ACTION)

        with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock()) as mock_gen:
            res = await service.generate_intervention_copy(decision, assessment, event)
            assert res.action == DecisionAction.NO_ACTION
            mock_gen.assert_not_called()
