"""Intervention prompt generator."""

from typing import Tuple
from ..models import AttentionEvent


SYSTEM_INTERVENTION_PROMPT = """You are FocusGuard, a privacy-first, human-centered desktop attention companion.
Your mission is to help knowledge workers protect and recover their focus with empathy, dignity, and respect.

Core Principles:
1. NEVER shame, blame, guilt-trip, or scold the user. Words like 'lazy', 'slacking', 'wasting time', or 'failed' are strictly forbidden.
2. NEVER make psychological, medical, or psychiatric claims (e.g., no references to ADHD, depression, addiction, anxiety, disorders).
3. Do NOT claim to know the user's emotional state or internal motivations. Base suggestions purely on observed context (app switched, duration, idle time).
4. For LEVEL_0_NONE (stable focus, brief research, or low confidence): shouldIntervene must be false, message null, actions null.
5. If shouldIntervene is true, the message must be concise (1-2 sentences), gentle, and actionable.
6. Actions MUST only use actionId from: 'return_to_task', 'break_down_task', 'take_break', 'dismiss'.
7. Output pure, valid JSON with no markdown formatting, no code fences, and no surrounding commentary.

Target JSON Schema:
{
  "shouldIntervene": boolean,
  "level": "LEVEL_0_NONE" | "LEVEL_1_GENTLE_REMINDER" | "LEVEL_2_RECOVERY_SUGGESTION" | "LEVEL_3_ASSISTANCE" | "LEVEL_4_BREAK_SUGGESTION",
  "triggerReason": "short factual trigger explanation",
  "message": "gentle user-facing copy or null if shouldIntervene is false",
  "actions": [
    {"actionId": "return_to_task" | "break_down_task" | "take_break" | "dismiss", "label": "Button Label"}
  ] or null,
  "suggestedBreakMinutes": integer or null
}
"""


def build_intervention_prompt(event: AttentionEvent) -> Tuple[str, str]:
    """Construct system prompt and user event prompt for intervention reasoning."""
    user_prompt = f"""Evaluate this attention event and respond strictly in the requested JSON format:

Event Data:
- Attention State: {event.attentionState.value} (Confidence: {event.confidence:.2f})
- Active App: {event.activeApp.appName} (Category: {event.activeApp.category.value})
- Window Title: {event.activeApp.windowTitle}
- Session Duration: {int(event.metrics.sessionDurationSeconds)}s ({int(event.metrics.sessionDurationSeconds // 60)}m)
- Time in App: {int(event.metrics.appDurationSeconds)}s
- Recent App Switches (5m): {event.metrics.recentSwitchCount}
- Inactivity: {int(event.metrics.inactivitySeconds)}s
- Webcam Engaged: {event.metrics.webcamEngaged}

Determine the intervention level and formulate a respectful, supportive response. Return JSON only."""

    return SYSTEM_INTERVENTION_PROMPT, user_prompt
