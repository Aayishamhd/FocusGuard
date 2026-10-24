"""Core coordinator service integrating LLM and deterministic fallbacks."""

import logging
import time
from typing import Dict, Optional

from ..config import settings
from ..guardrails.output_validator import (
    validate_and_normalize_decomposition,
    validate_and_normalize_intervention,
    validate_and_normalize_recovery,
)
from ..llm.fallback_heuristics import (
    decompose_task_heuristic,
    evaluate_intervention_heuristic,
    recovery_feedback_heuristic,
)
from ..llm.ollama_client import OllamaClient
from ..models import (
    AttentionEvent,
    AttentionState,
    HealthResponse,
    InterventionDecision,
    InterventionLevel,
    RecoveryFeedbackRequest,
    RecoveryFeedbackResponse,
    TaskDecompositionRequest,
    TaskDecompositionResponse,
)
from ..prompts.intervention import build_intervention_prompt
from ..prompts.recovery import build_recovery_prompt
from ..prompts.task_decomposition import build_task_decomposition_prompt

logger = logging.getLogger("focusguard.assistant.service")


class AssistantService:
    """Coordinates attention evaluation, task decomposition, and focus recovery."""

    def __init__(self, ollama_client: Optional[OllamaClient] = None):
        self.ollama = ollama_client or OllamaClient()
        self._last_intervention_time: Dict[str, float] = {}

    async def get_health(self) -> HealthResponse:
        """Check Ollama connectivity and return standard health response."""
        is_connected = await self.ollama.is_connected()
        return HealthResponse(
            status="ok",
            llmConnected=is_connected,
            model=self.ollama.model,
            fallbackMode=not is_connected,
        )

    def _is_cooldown_active(self, event: AttentionEvent) -> bool:
        """Check whether an intervention cooldown is active for this application."""
        key = event.activeApp.appName or "global"
        now = time.time()
        last_time = self._last_intervention_time.get(key, 0.0)
        return (now - last_time) < settings.intervention_cooldown_seconds

    def _record_intervention(self, event: AttentionEvent, decision: InterventionDecision) -> None:
        """Record the timestamp of an intervention to prevent alert fatigue."""
        if decision.shouldIntervene:
            key = event.activeApp.appName or "global"
            self._last_intervention_time[key] = time.time()

    async def evaluate_intervention(self, event: AttentionEvent) -> InterventionDecision:
        """
        Evaluate an AttentionEvent and decide whether and how to intervene.
        Uses deterministic rules to establish baseline safety, and Ollama for empathetic wording.
        """
        # Step 1: Pre-check cooldown
        if self._is_cooldown_active(event):
            logger.debug("Intervention suppressed by cooldown for %s", event.activeApp.appName)
            return evaluate_intervention_heuristic(event, cooldown_active=True)

        # Step 2: Deterministic rule check
        heuristic_decision = evaluate_intervention_heuristic(event, cooldown_active=False)

        # If deterministic rules indicate LEVEL_0_NONE (e.g. focused, productive lookup, low confidence),
        # return immediately without expensive LLM call.
        if heuristic_decision.level == InterventionLevel.LEVEL_0_NONE or not heuristic_decision.shouldIntervene:
            return heuristic_decision

        # Step 3: If intervention warranted, attempt LLM generation for nuanced wording
        if await self.ollama.is_connected():
            try:
                system_prompt, user_prompt = build_intervention_prompt(event)
                raw_response = await self.ollama.generate_json(system_prompt, user_prompt)
                if raw_response:
                    validated = validate_and_normalize_intervention(
                        raw_response,
                        fallback_reason=heuristic_decision.triggerReason,
                    )
                    if validated is not None:
                        # Ensure LLM did not downgrade a critical break suggestion or fabricate actions
                        if heuristic_decision.level == InterventionLevel.LEVEL_4_BREAK_SUGGESTION:
                            validated.level = InterventionLevel.LEVEL_4_BREAK_SUGGESTION
                            validated.suggestedBreakMinutes = 5
                        self._record_intervention(event, validated)
                        return validated
            except Exception as e:
                logger.warning("LLM intervention evaluation failed: %s. Using heuristic fallback.", e)

        # Step 4: Deterministic fallback
        self._record_intervention(event, heuristic_decision)
        return heuristic_decision

    async def decompose_task(self, request: TaskDecompositionRequest) -> TaskDecompositionResponse:
        """
        Break an intimidating task into 3-7 actionable, ordered micro-steps.
        Falls back seamlessly to deterministic decomposition if Ollama is unavailable.
        """
        task_desc = request.taskDescription.strip()

        # Step 1: Attempt LLM generation if available
        if await self.ollama.is_connected():
            try:
                system_prompt, user_prompt = build_task_decomposition_prompt(
                    task_description=task_desc,
                    difficulty_level=request.difficultyLevel,
                    existing_subtasks=request.existingSubtasks,
                )
                raw_response = await self.ollama.generate_json(system_prompt, user_prompt)
                if raw_response:
                    validated = validate_and_normalize_decomposition(
                        raw_response,
                        original_task=task_desc,
                    )
                    if validated is not None and len(validated.subtasks) >= 2:
                        return validated
            except Exception as e:
                logger.warning("LLM task decomposition failed: %s. Using heuristic fallback.", e)

        # Step 2: Heuristic fallback
        return decompose_task_heuristic(task_desc, request.difficultyLevel)

    async def recover_feedback(self, request: RecoveryFeedbackRequest) -> RecoveryFeedbackResponse:
        """
        Handle user feedback after attention drift and provide gentle recovery guidance.
        """
        # Step 1: Attempt LLM generation if available
        if await self.ollama.is_connected():
            try:
                system_prompt, user_prompt = build_recovery_prompt(request)
                raw_response = await self.ollama.generate_json(system_prompt, user_prompt)
                if raw_response:
                    validated = validate_and_normalize_recovery(raw_response)
                    if validated is not None:
                        return validated
            except Exception as e:
                logger.warning("LLM recovery coaching failed: %s. Using heuristic fallback.", e)

        # Step 2: Heuristic fallback
        return recovery_feedback_heuristic(
            user_reason=request.userReason,
            current_task=request.currentTask,
            notes=request.notes,
        )
