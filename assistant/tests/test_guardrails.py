"""Unit tests for output validation and AI safety guardrails."""

import json
from assistant.src.guardrails.output_validator import (
    safe_parse_json,
    validate_and_normalize_decomposition,
    validate_and_normalize_intervention,
    validate_and_normalize_recovery,
)
from assistant.src.guardrails.safety_filter import is_text_safe, sanitize_user_facing_text
from assistant.src.models import InterventionLevel, RecoveryRecommendation


class TestSafeJsonParser:
    def test_parse_direct_json(self):
        raw = '{"key": "value", "number": 42}'
        res = safe_parse_json(raw)
        assert res == {"key": "value", "number": 42}

    def test_parse_markdown_fence_with_json_tag(self):
        raw = "```json\n{\n  \"status\": \"ok\"\n}\n```"
        res = safe_parse_json(raw)
        assert res == {"status": "ok"}

    def test_parse_markdown_fence_without_tag(self):
        raw = "```\n{\n  \"shouldIntervene\": true\n}\n```"
        res = safe_parse_json(raw)
        assert res == {"shouldIntervene": True}

    def test_parse_embedded_json(self):
        raw = "Here is the result:\n{\"level\": \"LEVEL_0_NONE\"}\nHope this helps!"
        res = safe_parse_json(raw)
        assert res == {"level": "LEVEL_0_NONE"}

    def test_parse_malformed_returns_none(self):
        raw = "This is not json at all {broken"
        assert safe_parse_json(raw) is None


class TestSafetyFilter:
    def test_shaming_language_detected(self):
        assert not is_text_safe("You are lazy and need to work.")
        assert not is_text_safe("You're slacking off again.")
        assert not is_text_safe("You are wasting your time on YouTube.")
        assert not is_text_safe("Stop being lazy!")

    def test_medical_psychological_claims_detected(self):
        assert not is_text_safe("This looks like severe ADHD.")
        assert not is_text_safe("You might suffer from clinical depression.")
        assert not is_text_safe("You have a psychiatric mental disorder.")

    def test_command_injection_detected(self):
        assert not is_text_safe("Run rm -rf / to clear cache")
        assert not is_text_safe("Open cmd.exe and type sudo")

    def test_supportive_language_passes(self):
        assert is_text_safe("Looks like your focus shifted to another tab. Would you like to resume?")
        assert is_text_safe("You've been working intensely. A 5-minute break will help you recharge.")
        assert is_text_safe("Ready to jump back into writing documentation?")

    def test_sanitize_user_facing_text_replaces_unsafe(self):
        safe_fallback = "Ready to resume your task?"
        result = sanitize_user_facing_text("You are being lazy!", safe_fallback)
        assert result == safe_fallback

        safe_input = "Would you like to take a break?"
        assert sanitize_user_facing_text(safe_input, safe_fallback) == safe_input


class TestOutputNormalization:
    def test_normalize_intervention_level_0_clears_message(self):
        raw = {
            "level": "LEVEL_0_NONE",
            "shouldIntervene": True,  # Contradictory model flag
            "message": "Some message that shouldn't appear",
        }
        res = validate_and_normalize_intervention(raw)
        assert res is not None
        assert res.level == InterventionLevel.LEVEL_0_NONE
        assert res.shouldIntervene is False
        assert res.message is None
        assert res.actions is None
        assert res.decisionId.startswith("dec-")

    def test_normalize_decomposition_enforces_single_immediate_step(self):
        # Model produced two immediate steps and unsequential numbers
        raw = {
            "originalTask": "Fix bug",
            "subtasks": [
                {
                    "stepNumber": 99,
                    "title": "Open IDE",
                    "description": "Launch VS Code",
                    "estimatedMinutes": 5,
                    "isImmediateNextStep": True,
                },
                {
                    "stepNumber": 100,
                    "title": "Run tests",
                    "description": "Execute pytest",
                    "estimatedMinutes": 10,
                    "isImmediateNextStep": True,  # Invalid: second immediate step
                },
            ],
        }
        res = validate_and_normalize_decomposition(raw, "Fix bug")
        assert res is not None
        assert len(res.subtasks) == 2
        # Sequential numbering
        assert res.subtasks[0].stepNumber == 1
        assert res.subtasks[1].stepNumber == 2
        # Exactly one isImmediateNextStep
        immediate_count = sum(1 for st in res.subtasks if st.isImmediateNextStep)
        assert immediate_count == 1
        assert res.subtasks[0].isImmediateNextStep is True
        assert res.subtasks[1].isImmediateNextStep is False

    def test_normalize_decomposition_rejects_unsafe_content(self):
        raw = {
            "subtasks": [
                {
                    "stepNumber": 1,
                    "title": "Stop being lazy",
                    "description": "Work harder",
                    "estimatedMinutes": 5,
                }
            ]
        }
        assert validate_and_normalize_decomposition(raw, "Task") is None

    def test_normalize_recovery_success(self):
        raw = {
            "recommendation": "take_break",
            "supportiveMessage": "Take a 5 minute rest to reset.",
            "actionPayload": {"suggestedBreakMinutes": 5},
        }
        res = validate_and_normalize_recovery(raw)
        assert res is not None
        assert res.recommendation == RecoveryRecommendation.TAKE_BREAK
        assert res.actionPayload.suggestedBreakMinutes == 5
