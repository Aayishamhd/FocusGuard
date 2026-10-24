"""Recovery coaching prompt generator."""

import json
from typing import Optional, Tuple
from ..models import RecoveryFeedbackRequest


SYSTEM_RECOVERY_PROMPT = """You are FocusGuard's Recovery Coach.
Your mission is to support users when their focus slips or when they feel stuck, tired, or overwhelmed.

Principles:
1. Be concise, empathetic, and encouraging. Never scold or show disappointment.
2. If reason is 'tired': recommend a restful break without guilt (recommendation: 'take_break').
3. If reason is 'task_confusing': recommend shrinking the task to one micro-step (recommendation: 'simplify_task').
4. If reason is 'distracted': provide a gentle, low-friction return step (recommendation: 'resume_previous').
5. If reason is 'need_break': validate their need for rest (recommendation: 'take_break').
6. Valid recommendation values: 'take_break', 'simplify_task', 'resume_previous', 'custom_tip'.
7. Output pure, valid JSON with NO markdown code fences or conversational text.

Target JSON Schema:
{
  "recommendation": "take_break" | "simplify_task" | "resume_previous" | "custom_tip",
  "supportiveMessage": "empathetic guidance message",
  "actionPayload": {
    "suggestedBreakMinutes": integer or null,
    "suggestedNextAction": "concrete next step string or null"
  }
}
"""


def build_recovery_prompt(request: RecoveryFeedbackRequest) -> Tuple[str, str]:
    """Construct prompt for recovery coaching."""
    user_prompt = f"""Provide supportive focus recovery guidance for this user check-in:

- Reason: {request.userReason.value}
- Current Task: {json.dumps(request.currentTask or 'General Work')}
- Notes: {json.dumps(request.notes or '')}

Provide an empathetic response matching the required JSON schema."""

    return SYSTEM_RECOVERY_PROMPT, user_prompt
