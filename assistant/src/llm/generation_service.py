"""
assistant/src/llm/generation_service.py

Stage 4 Generation Service for FocusGuard Attention Agent.
Coordinates LLM structured generation, action consistency validation,
safety filtering, and deterministic fallback.
"""

from __future__ import annotations

import logging
from typing import Optional

from ..attention.state_engine import AttentionAssessment
from ..config import settings
from ..decision.models import DecisionAction, DecisionResult
from ..guardrails.output_validator import extract_json_str, parse_and_validate
from ..guardrails.safety_filter import sanitize_text
from ..models.contracts import AttentionEvent
from .deterministic_fallbacks import get_deterministic_fallback
from .ollama_client import ollama_client
from .prompt_builder import build_intervention_prompt
from .schemas import LLMInterventionInput, LLMInterventionOutput

logger = logging.getLogger(__name__)


class GenerationService:
    """
    Translates deterministic DecisionResults into gentle, human-centered copy
    using local LLM with strict action binding and fallback guarantees.
    """

    async def generate_intervention_copy(
        self,
        decision: DecisionResult,
        assessment: AttentionAssessment,
        event: AttentionEvent,
        current_task: Optional[str] = None,
        user_feedback: Optional[str] = None,
    ) -> LLMInterventionOutput:
        """
        Main entry point for Stage 4 generation.
        """
        # 1. No action required -> return immediately without LLM invocation
        if decision.action == DecisionAction.NO_ACTION:
            return LLMInterventionOutput(
                message="User is in flow; no intervention needed.",
                action=DecisionAction.NO_ACTION,
            )

        # 2. Build structured input context
        input_ctx = LLMInterventionInput(
            allowed_action=decision.action,
            attention_state=assessment.state.value,
            active_app=event.activeApp.appName,
            window_title=event.activeApp.windowTitle,
            app_duration_seconds=event.metrics.appDurationSeconds,
            session_duration_seconds=event.metrics.sessionDurationSeconds,
            reason_codes=decision.reason_codes,
            confidence=assessment.confidence,
            current_task=current_task,
            user_feedback=user_feedback,
        )

        # 3. Check force fallback or Ollama availability
        if settings.force_fallback or not await ollama_client.is_available():
            logger.debug("Ollama offline or force_fallback active — using deterministic fallback copy")
            return get_deterministic_fallback(input_ctx)

        # 4. Attempt LLM generation
        try:
            system_prompt, user_prompt = build_intervention_prompt(input_ctx)
            raw_text = await ollama_client.generate(
                prompt=user_prompt, system=system_prompt, format_json=True
            )
            if not raw_text or not raw_text.strip():
                logger.info("Ollama returned empty response — invoking fallback copy")
                return get_deterministic_fallback(input_ctx)

            # 5. Parse and validate against structured schema
            output = parse_and_validate(raw_text, LLMInterventionOutput)

            # 6. ACTION CONSISTENCY GUARD:
            # The LLM cannot override the deterministic decision!
            if output.action != decision.action:
                logger.warning(
                    "LLM action hallucination detected! Expected %s but got %s — rejecting and using fallback",
                    decision.action.value,
                    output.action.value,
                )
                return get_deterministic_fallback(input_ctx)

            # 7. Safety filter on user-facing copy
            output.message = sanitize_text(output.message) or output.message
            if output.next_step:
                output.next_step = sanitize_text(output.next_step) or output.next_step

            return output

        except Exception as exc:
            logger.warning("LLM generation/validation failed: %s — invoking deterministic fallback", exc)
            return get_deterministic_fallback(input_ctx)


# Singleton instance
generation_service = GenerationService()
