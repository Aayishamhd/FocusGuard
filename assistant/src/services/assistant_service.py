"""
assistant/src/services/assistant_service.py

Core coordinator for the AI Assistant service.

Stage 2 Architecture:
    request
        → check force_fallback config
        → build prompt & query Ollama LLM (async httpx, with timeout)
        → parse JSON & validate against Pydantic contract
        → apply safety filter (strip shaming / diagnostic language)
        → (on any failure, timeout, or offline status) gracefully fall back to heuristics
        → return valid contract-compliant response (never 500)

The public methods of this module are what server.py calls.
They never raise to the caller — all errors are caught internally and
converted into valid responses.
"""

from __future__ import annotations

import logging

from ..config import settings
from ..guardrails.output_validator import parse_and_validate
from ..guardrails.safety_filter import (
    sanitize_decision,
    sanitize_decomposition,
    sanitize_recovery,
)
from ..llm.fallback_heuristics import (
    decide_intervention,
    decompose_task,
    guide_recovery,
)
from ..llm.ollama_client import ollama_client
from ..models.contracts import (
    AttentionEvent,
    AttentionState,
    HealthResponse,
    InterventionDecision,
    InterventionLevel,
    RecoveryFeedbackRequest,
    RecoveryFeedbackResponse,
    Subtask,
    TaskDecompositionRequest,
    TaskDecompositionResponse,
)
from ..prompts.intervention import build_intervention_prompt
from ..prompts.recovery import build_recovery_prompt
from ..prompts.task_decomposition import build_task_decomposition_prompt

logger = logging.getLogger(__name__)


class AssistantService:
    """
    Stateless service coordinator.
    One instance is created at startup and shared across all requests.
    """

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    async def health(self) -> HealthResponse:
        """
        Reports service health, LLM connectivity, and whether running in fallback mode.
        """
        is_online = await ollama_client.is_available()
        fallback_mode = settings.force_fallback or not is_online
        return HealthResponse(
            status="ok",
            llmConnected=is_online,
            model=settings.ollama_model,
            fallbackMode=fallback_mode,
        )

    # ------------------------------------------------------------------
    # Intervention decision  (POST /api/intervene)
    # ------------------------------------------------------------------

    async def intervene(self, event: AttentionEvent) -> InterventionDecision:
        """
        Evaluates AttentionEvent. Attempts Ollama generation, falling back
        to heuristic engine if Ollama is unreachable, times out, or returns invalid JSON.
        """
        if settings.force_fallback:
            logger.debug("FORCE_FALLBACK=true — skipping LLM, using heuristics")
            return self._fallback_intervene(event)

        try:
            system_prompt, user_prompt = build_intervention_prompt(event)
            raw_response = await ollama_client.generate(
                prompt=user_prompt, system=system_prompt
            )
            if raw_response:
                decision = parse_and_validate(raw_response, InterventionDecision)
                decision = self._apply_llm_safety_bounds(decision, event)
                return sanitize_decision(decision)
            logger.info("Ollama returned empty or timed out; falling back to heuristics")
        except Exception as exc:
            logger.warning("LLM intervention path failed: %s; invoking fallback", exc)

        return self._fallback_intervene(event)

    def _apply_llm_safety_bounds(
        self, decision: InterventionDecision, event: AttentionEvent
    ) -> InterventionDecision:
        """
        Deterministic sanity guards ensuring the LLM cannot hallucinate inappropriate levels:
        1. Low confidence (<0.50) overrides LLM to suppress intervention.
        2. Break suggestion (LEVEL_4) is capped if session < 3600 seconds.
        3. Stable focus in work apps with short session suppresses intervention.
        """
        if event.confidence < 0.50:
            decision.shouldIntervene = False
            decision.level = InterventionLevel.LEVEL_0_NONE
            decision.triggerReason = (
                f"Confidence too low ({event.confidence:.2f}) — suppressing intervention"
            )
            decision.message = None
            decision.actions = []
            return decision

        if decision.level == InterventionLevel.LEVEL_4_BREAK_SUGGESTION:
            if event.metrics.sessionDurationSeconds < 3600:
                decision.level = InterventionLevel.LEVEL_1_GENTLE_REMINDER
                decision.suggestedBreakMinutes = None

        if (
            event.attentionState == AttentionState.FOCUSED
            and event.activeApp.category in ("work", "utility")
            and event.metrics.sessionDurationSeconds < 5400
        ):
            decision.shouldIntervene = False
            decision.level = InterventionLevel.LEVEL_0_NONE
            decision.message = None
            decision.actions = []

        return decision

    def _fallback_intervene(self, event: AttentionEvent) -> InterventionDecision:
        try:
            decision = decide_intervention(event)
            return sanitize_decision(decision)
        except Exception as exc:
            logger.error("Fallback heuristic failed unexpectedly: %s", exc)
            return InterventionDecision(
                shouldIntervene=False,
                level=InterventionLevel.LEVEL_0_NONE,
                triggerReason="Internal error — safe no-op",
            )

    # ------------------------------------------------------------------
    # Task decomposition  (POST /api/decompose)
    # ------------------------------------------------------------------

    async def decompose(
        self, request: TaskDecompositionRequest
    ) -> TaskDecompositionResponse:
        """
        Breaks large tasks into smaller steps. Attempts Ollama generation with fallback.
        """
        if settings.force_fallback:
            return self._fallback_decompose(request)

        try:
            system_prompt, user_prompt = build_task_decomposition_prompt(request)
            raw_response = await ollama_client.generate(
                prompt=user_prompt, system=system_prompt
            )
            if raw_response:
                decomp = parse_and_validate(raw_response, TaskDecompositionResponse)
                return sanitize_decomposition(decomp)
            logger.info("Ollama task decomposition unavailable; falling back to heuristics")
        except Exception as exc:
            logger.warning("LLM decompose path failed: %s; invoking fallback", exc)

        return self._fallback_decompose(request)

    def _fallback_decompose(
        self, request: TaskDecompositionRequest
    ) -> TaskDecompositionResponse:
        try:
            result = decompose_task(request)
            return sanitize_decomposition(result)
        except Exception as exc:
            logger.error("Task decomposition fallback failed: %s", exc)
            return TaskDecompositionResponse(
                originalTask=request.taskDescription,
                subtasks=[
                    Subtask(
                        stepNumber=1,
                        title=f"Start working on: {request.taskDescription}",
                        description="Take the first small step.",
                        estimatedMinutes=10,
                        isImmediateNextStep=True,
                    )
                ],
            )

    # ------------------------------------------------------------------
    # Recovery guidance  (POST /api/recover)
    # ------------------------------------------------------------------

    async def recover(
        self, request: RecoveryFeedbackRequest
    ) -> RecoveryFeedbackResponse:
        """
        Provides supportive recovery guidance. Attempts Ollama generation with fallback.
        """
        if settings.force_fallback:
            return self._fallback_recover(request)

        try:
            system_prompt, user_prompt = build_recovery_prompt(request)
            raw_response = await ollama_client.generate(
                prompt=user_prompt, system=system_prompt
            )
            if raw_response:
                recovery = parse_and_validate(raw_response, RecoveryFeedbackResponse)
                return sanitize_recovery(recovery)
            logger.info("Ollama recovery unavailable; falling back to heuristics")
        except Exception as exc:
            logger.warning("LLM recovery path failed: %s; invoking fallback", exc)

        return self._fallback_recover(request)

    def _fallback_recover(
        self, request: RecoveryFeedbackRequest
    ) -> RecoveryFeedbackResponse:
        try:
            result = guide_recovery(request)
            return sanitize_recovery(result)
        except Exception as exc:
            logger.error("Recovery fallback failed: %s", exc)
            return RecoveryFeedbackResponse(
                recommendation="custom_tip",
                supportiveMessage="Take a moment to breathe. You've got this.",
            )


# Singleton instance — imported by server.py
assistant_service = AssistantService()
