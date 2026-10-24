"""
assistant/src/guardrails/output_validator.py

Validates and parses raw text responses from LLM into typed Pydantic contract models.
Cleans markdown fences, extracts JSON substrings, and enforces strict schema compliance.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Type, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def extract_json_str(raw: str) -> str:
    """
    Strips markdown code fences and isolates JSON substring.
    """
    cleaned = raw.strip()

    # Strip ```json ... ``` or ``` ... ```
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    # If extra text precedes or follows the first { or [ and last } or ]
    start_bracket = cleaned.find("{")
    start_square = cleaned.find("[")
    
    starts = [pos for pos in (start_bracket, start_square) if pos != -1]
    if starts:
        start_idx = min(starts)
        end_brace = cleaned.rfind("}")
        end_square = cleaned.rfind("]")
        end_idx = max(end_brace, end_square)
        if end_idx > start_idx:
            cleaned = cleaned[start_idx : end_idx + 1]

    return cleaned


def parse_and_validate(raw_text: str, model_cls: Type[T]) -> T:
    """
    Parse raw string into JSON and validate against model_cls.
    Raises ValueError or ValidationError if invalid.
    """
    if not raw_text or not raw_text.strip():
        raise ValueError("Empty response received from LLM")

    cleaned_json = extract_json_str(raw_text)
    try:
        data = json.loads(cleaned_json)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to decode JSON from LLM: %s. Raw: %r", exc, raw_text[:200])
        raise ValueError(f"Invalid JSON: {exc}") from exc

    try:
        return model_cls.model_validate(data)
    except ValidationError as exc:
        logger.warning(
            "Pydantic schema validation failed for %s: %s",
            model_cls.__name__,
            exc,
        )
        raise
