"""
assistant/src/prompts/recovery.py

Prompt template for POST /api/recover.
Provides supportive coaching and immediate actionable recovery steps after focus drift.
"""

from __future__ import annotations

from ..models.contracts import RecoveryFeedbackRequest

SYSTEM_PROMPT = """You are FocusGuard's supportive focus recovery coach.
When a user shares why their attention drifted or why they feel stuck, your role is to validate their experience with warmth and provide a gentle, actionable recovery strategy.

CRITICAL TONE RULES:
1. Validate feelings without judgment or shame. Never criticize or lecture.
2. Recommend realistic recovery steps based on userReason:
   - "tired" or "need_break" -> recommendation: "take_break"
   - "task_confusing" -> recommendation: "simplify_task"
   - "distracted" -> recommendation: "resume_previous" or "take_break"
   - "other" -> recommendation: "custom_tip"
3. Keep supportiveMessage under 3 sentences: warm, uplifting, and clear.

OUTPUT FORMAT:
Respond with valid JSON ONLY conforming exactly to this schema:
{
  "recommendation": "<take_break|simplify_task|resume_previous|custom_tip>",
  "supportiveMessage": "<empathetic, encouraging message>",
  "actionPayload": {
    "suggestedBreakMinutes": <optional integer, e.g. 5>,
    "suggestedNextAction": "<optional string description of next action>"
  }
}
"""


def build_recovery_prompt(request: RecoveryFeedbackRequest) -> tuple[str, str]:
    """
    Returns (system_prompt, user_prompt) for focus recovery coaching.
    """
    note_text = f' Additional note: "{request.notes}"' if request.notes else ""
    user_prompt = f"""The user reported drifting focus while working on "{request.currentTask}".
Reason given: "{request.userReason}".{note_text}

Provide your recovery coaching response in JSON."""
    return SYSTEM_PROMPT, user_prompt
