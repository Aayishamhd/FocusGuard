"""
assistant/src/llm/prompt_builder.py

Modular prompt architecture for FocusGuard LLM generation (Stage 4).
Separates system instructions, attention context, task, feedback,
action constraints, and output schema.
"""

from __future__ import annotations

import json
from .schemas import LLMInterventionInput

SYSTEM_INSTRUCTIONS = """You are FocusGuard's supportive, empathetic attention assistant.
Your sole job is to craft gentle, respectful, human-centered copy for a predetermined intervention action.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. The intervention decision has ALREADY been made deterministically by the system.
   You must NOT change the action or invent a different action.
2. Respect user autonomy: Never force, scold, command, or insist. Always present choices as gentle invitations.
3. No psychological or medical claims: Never mention ADHD, anxiety, depression, burnout, or mental disorders.
4. No shaming or judgment: Never use words like "lazy", "wasting time", "slacking", "bad habit", or "failure".
5. Acknowledge uncertainty: State factual observations ("Recent activity suggests attention may have shifted"), never claim to know the user's internal thoughts.
6. Keep messages strictly concise: 1 to 2 clear sentences maximum.

ALLOWED ACTIONS AND INTENDED TONE:
- GENTLE_REMINDER: Subtle notification noticing an activity shift; zero pressure.
- RETURN_TO_TASK: Clear, encouraging invitation to return to their stated task.
- TASK_ASSISTANCE: Offering a bite-sized, concrete first micro-step to overcome hesitation.
- BREAK_SUGGESTION: Congratulating on sustained deep focus and suggesting a restorative 5-minute break.
- RECOVERY_MODE: Empathetic validation welcoming the user back after distraction.
"""


def format_attention_context(ctx: LLMInterventionInput) -> str:
    """Renders factual desktop activity observations."""
    minutes_in_app = int(ctx.app_duration_seconds // 60)
    session_minutes = int(ctx.session_duration_seconds // 60)
    return (
        f"### Attention Context\n"
        f"- Inferred State: {ctx.attention_state}\n"
        f"- Active Application: {ctx.active_app} (Title: \"{ctx.window_title}\")\n"
        f"- Active App Dwell Time: {minutes_in_app} minute(s)\n"
        f"- Total Session Duration: {session_minutes} minute(s)\n"
        f"- Context Reason Codes: {', '.join(ctx.reason_codes)}\n"
        f"- Signal Confidence: {ctx.confidence:.2f}"
    )


def format_task_context(task: str | None) -> str:
    """Renders user's stated goal if available."""
    if not task or not task.strip():
        return "### Primary Task\n(No active task specified by user)"
    return f"### Primary Task\nTarget: \"{task.strip()}\""


def format_feedback_context(feedback: str | None) -> str:
    """Renders recent user feedback if provided."""
    if not feedback or not feedback.strip():
        return ""
    return f"### Recent User Feedback\nUser note: \"{feedback.strip()}\""


def format_action_constraint(allowed_action: str) -> str:
    """Enforces strict action binding."""
    return (
        f"### Allowed Action (MANDATORY)\n"
        f"You MUST use action: \"{allowed_action}\".\n"
        f"Do not substitute or hallucinate any other action."
    )


def format_response_schema(allowed_action: str) -> str:
    """Specifies JSON schema with concrete constraints."""
    needs_next_step = (allowed_action == "TASK_ASSISTANCE")
    needs_break = (allowed_action == "BREAK_SUGGESTION")

    next_step_desc = (
        '"<concrete, 5-10 minute immediate micro-step>"'
        if needs_next_step
        else "null"
    )
    break_desc = "5" if needs_break else "null"

    return f"""### Output Requirements
Respond with valid JSON ONLY conforming exactly to this structure:
{{
  "message": "<1-2 sentence supportive, non-judgmental user message>",
  "action": "{allowed_action}",
  "next_step": {next_step_desc},
  "suggested_break_minutes": {break_desc}
}}"""


def build_intervention_prompt(ctx: LLMInterventionInput) -> tuple[str, str]:
    """
    Assembles modular system and user prompt sections.
    Returns (system_prompt, user_prompt).
    """
    sections = [
        format_attention_context(ctx),
        format_task_context(ctx.current_task),
    ]

    fb = format_feedback_context(ctx.user_feedback)
    if fb:
        sections.append(fb)

    sections.append(format_action_constraint(ctx.allowed_action.value))
    sections.append(format_response_schema(ctx.allowed_action.value))

    user_prompt = "\n\n".join(sections)
    return SYSTEM_INSTRUCTIONS, user_prompt
