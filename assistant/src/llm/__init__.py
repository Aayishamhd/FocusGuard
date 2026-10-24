"""
assistant/src/llm/__init__.py

Stage 4 LLM Generation & Prompt Engineering package for FocusGuard.
"""

from .deterministic_fallbacks import get_deterministic_fallback
from .generation_service import GenerationService, generation_service
from .ollama_client import OllamaClient, ollama_client
from .prompt_builder import (
    SYSTEM_INSTRUCTIONS,
    build_intervention_prompt,
    format_action_constraint,
    format_attention_context,
    format_feedback_context,
    format_response_schema,
    format_task_context,
)
from .schemas import LLMInterventionInput, LLMInterventionOutput

__all__ = [
    "OllamaClient",
    "ollama_client",
    "GenerationService",
    "generation_service",
    "LLMInterventionInput",
    "LLMInterventionOutput",
    "SYSTEM_INSTRUCTIONS",
    "build_intervention_prompt",
    "get_deterministic_fallback",
]
