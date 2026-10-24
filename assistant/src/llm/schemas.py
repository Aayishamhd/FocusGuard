"""
assistant/src/llm/schemas.py

Pydantic models and schemas for structured LLM input and output (Stage 4).
Enforces action consistency, length bounds, and non-diagnostic wording.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from ..decision.models import DecisionAction


class LLMInterventionInput(BaseModel):
    """Encapsulates all context passed into the prompt builder."""
    allowed_action: DecisionAction
    attention_state: str
    active_app: str
    window_title: str
    app_duration_seconds: float
    session_duration_seconds: float
    reason_codes: List[str]
    confidence: float
    current_task: Optional[str] = None
    user_feedback: Optional[str] = None


class LLMInterventionOutput(BaseModel):
    """
    Strictly validated structured response required from the LLM.
    """
    message: str = Field(
        ...,
        min_length=5,
        max_length=320,
        description="Concise, supportive, non-judgmental user-facing message.",
    )
    action: DecisionAction = Field(
        ...,
        description="Must match the exact allowed action determined by Stage 3.",
    )
    next_step: Optional[str] = Field(
        default=None,
        max_length=160,
        description="Smallest immediate next step (primarily for TASK_ASSISTANCE).",
    )
    suggested_break_minutes: Optional[int] = Field(
        default=None,
        ge=1,
        le=60,
        description="Suggested break duration (for BREAK_SUGGESTION).",
    )

    @field_validator("message")
    @classmethod
    def validate_message_conciseness(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Message cannot be empty or whitespace.")
        # Discourage multi-paragraph text
        if clean.count("\n\n") > 1:
            raise ValueError("Message must be concise (single paragraph).")
        return clean
