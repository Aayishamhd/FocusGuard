"""
assistant/tests/test_guardrails.py

Tests for AI safety guardrails and output validator:
1. Stripping markdown code fences (```json ... ```)
2. Extracting embedded JSON from conversational LLM output
3. Rejecting invalid schemas
4. Sanitizing shaming language ("lazy", "wasting time", "slacking off")
5. Sanitizing diagnostic language ("ADHD", "depression", "anxiety disorder")
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.guardrails.output_validator import extract_json_str, parse_and_validate
from src.guardrails.safety_filter import (
    sanitize_decision,
    sanitize_decomposition,
    sanitize_recovery,
    sanitize_text,
)
from src.models.contracts import (
    InterventionDecision,
    InterventionLevel,
    RecoveryFeedbackResponse,
    Subtask,
    TaskDecompositionResponse,
)


class TestOutputValidator:
    def test_strip_markdown_json_fences(self):
        raw = """```json
{
  "status": "ok"
}
```"""
        cleaned = extract_json_str(raw)
        assert cleaned == '{\n  "status": "ok"\n}'

    def test_strip_generic_code_fences(self):
        raw = "```\n{\"key\": 123}\n```"
        cleaned = extract_json_str(raw)
        assert cleaned == '{"key": 123}'

    def test_extract_json_surrounded_by_text(self):
        raw = "Here is your response:\n{\"originalTask\": \"Write report\", \"subtasks\": []}\nHope that helps!"
        cleaned = extract_json_str(raw)
        assert cleaned == '{"originalTask": "Write report", "subtasks": []}'

    def test_parse_and_validate_valid_decision(self):
        raw = """```json
{
  "decisionId": "dec-test-1",
  "timestamp": "2026-10-24T20:00:00.000Z",
  "shouldIntervene": true,
  "level": "LEVEL_1_GENTLE_REMINDER",
  "triggerReason": "User attention drifted to browser",
  "message": "Notice a slight drift.",
  "actions": []
}
```"""
        decision = parse_and_validate(raw, InterventionDecision)
        assert decision.decisionId == "dec-test-1"
        assert decision.level == InterventionLevel.LEVEL_1_GENTLE_REMINDER
        assert decision.shouldIntervene is True

    def test_parse_and_validate_invalid_json_raises(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            parse_and_validate("This is definitely not JSON", InterventionDecision)

    def test_parse_and_validate_schema_mismatch_raises(self):
        # Missing required shouldIntervene and level
        raw = '{"decisionId": "dec-123"}'
        with pytest.raises(ValidationError):
            parse_and_validate(raw, InterventionDecision)


class TestSafetyFilter:
    def test_sanitize_shaming_lazy(self):
        text = "You are lazy and need to work."
        cleaned = sanitize_text(text)
        assert "lazy" not in cleaned.lower()
        assert "drifted" in cleaned.lower()

    def test_sanitize_shaming_wasting_time(self):
        text = "Stop wasting time on social media."
        cleaned = sanitize_text(text)
        assert "wasting time" not in cleaned.lower()

    def test_sanitize_shaming_slacking_off(self):
        text = "You have been slacking off."
        cleaned = sanitize_text(text)
        assert "slacking off" not in cleaned.lower()

    def test_sanitize_diagnostic_adhd(self):
        text = "Your ADHD is showing in frequent app switches."
        cleaned = sanitize_text(text)
        assert "adhd" not in cleaned.lower()
        assert "attention fluctuation" in cleaned.lower()

    def test_sanitize_diagnostic_depression(self):
        text = "You look clinically depressed today."
        cleaned = sanitize_text(text)
        assert "clinically depressed" not in cleaned.lower()

    def test_sanitize_decision_object(self):
        dec = InterventionDecision(
            decisionId="dec-shame-1",
            timestamp="2026-10-24T20:00:00.000Z",
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
            triggerReason="User is slacking off and wasting time",
            message="You are lazy. Back to work!",
            actions=[],
        )
        cleaned = sanitize_decision(dec)
        assert "lazy" not in cleaned.message.lower()
        assert "wasting time" not in cleaned.triggerReason.lower()

    def test_sanitize_recovery_object(self):
        rec = RecoveryFeedbackResponse(
            recommendation="take_break",
            supportiveMessage="Stop being a failure and deal with your depression.",
        )
        cleaned = sanitize_recovery(rec)
        assert "failure" not in cleaned.supportiveMessage.lower()
        assert "depression" not in cleaned.supportiveMessage.lower()

    def test_sanitize_decomposition_object(self):
        decomp = TaskDecompositionResponse(
            originalTask="Fix bugs",
            subtasks=[
                Subtask(
                    stepNumber=1,
                    title="Stop slacking off",
                    description="Don't be lazy, open the terminal.",
                    estimatedMinutes=10,
                    isImmediateNextStep=True,
                )
            ],
        )
        cleaned = sanitize_decomposition(decomp)
        assert "slacking off" not in cleaned.subtasks[0].title.lower()
        assert "lazy" not in cleaned.subtasks[0].description.lower()
