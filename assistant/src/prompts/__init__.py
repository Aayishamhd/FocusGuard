"""
assistant/src/prompts/__init__.py
Prompt engineering templates for FocusGuard AI Assistant.
"""

from .intervention import build_intervention_prompt
from .task_decomposition import build_task_decomposition_prompt
from .recovery import build_recovery_prompt

__all__ = [
    "build_intervention_prompt",
    "build_task_decomposition_prompt",
    "build_recovery_prompt",
]
