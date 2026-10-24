"""
assistant/src/prompts/task_decomposition.py

Prompt template for POST /api/decompose.
Guides the LLM to break large/vague goals into bite-sized, actionable micro-steps.
"""

from __future__ import annotations

from ..models.contracts import TaskDecompositionRequest

SYSTEM_PROMPT = """You are FocusGuard's task decomposition specialist.
Your goal is to reduce friction and cognitive overload by breaking a user's task into 2 to 5 clear, bite-sized, actionable subtasks.

RULES:
1. The first subtask must be extremely easy and concrete (the smallest immediate next step, estimated at 5-10 minutes) with "isImmediateNextStep": true.
2. Subsequent steps should have "isImmediateNextStep": false.
3. Keep descriptions encouraging, concrete, and free of jargon or overwhelm.
4. Keep estimatedMinutes realistic (typically 5 to 25 minutes per subtask).

OUTPUT FORMAT:
Respond with valid JSON ONLY conforming exactly to this schema:
{
  "originalTask": "<original task description>",
  "subtasks": [
    {
      "stepNumber": 1,
      "title": "<short concrete action title>",
      "description": "<one or two clear sentences on how to complete it>",
      "estimatedMinutes": 10,
      "isImmediateNextStep": true
    }
  ]
}
"""


def build_task_decomposition_prompt(
    request: TaskDecompositionRequest,
) -> tuple[str, str]:
    """
    Returns (system_prompt, user_prompt) for task decomposition.
    """
    diff_hint = ""
    if request.difficultyLevel == "quick":
        diff_hint = " Target 2 quick, lightweight steps (5-10 mins each)."
    elif request.difficultyLevel == "complex":
        diff_hint = " Target 4 to 5 structured milestone steps."
    else:
        diff_hint = " Target 3 to 4 clear steps."

    existing_hint = ""
    if request.existingSubtasks:
        existing_hint = f"\nAlready considered steps: {', '.join(request.existingSubtasks)}."

    user_prompt = f"""Break down this user task into bite-sized subtasks:{diff_hint}{existing_hint}

Task: "{request.taskDescription}"

Respond with valid JSON ONLY."""
    return SYSTEM_PROMPT, user_prompt
