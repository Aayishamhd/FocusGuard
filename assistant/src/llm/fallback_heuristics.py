"""
assistant/src/llm/fallback_heuristics.py

Pure-Python rule-based fallback engine.

Runs when:
  - Ollama is offline / unreachable
  - Ollama response times out (> OLLAMA_TIMEOUT_SECONDS)
  - Ollama returns JSON that fails schema validation
  - FORCE_FALLBACK=true in config

This engine must NEVER raise an exception. It must always return a valid,
contract-compliant response object. No LLM, no network calls.

Rules are intentionally simple and transparent. They should feel helpful,
not punitive. They follow the intervention philosophy in the spec:
    "Help people recover focus, never punish distraction."
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from ..models.contracts import (
    AttentionEvent,
    AttentionState,
    InterventionAction,
    InterventionDecision,
    InterventionLevel,
    RecoveryActionPayload,
    RecoveryFeedbackRequest,
    RecoveryFeedbackResponse,
    Subtask,
    TaskDecompositionRequest,
    TaskDecompositionResponse,
    UserReason,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dec_id() -> str:
    return f"dec-fb-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Standard action sets
# ---------------------------------------------------------------------------

_STANDARD_ACTIONS = [
    InterventionAction(actionId="return_to_task", label="Get Back on Track"),
    InterventionAction(actionId="break_down_task", label="Break Into Smaller Steps"),
    InterventionAction(actionId="take_break", label="Take a Short Break"),
    InterventionAction(actionId="dismiss", label="I'm Still Focused"),
]

_RETURN_OR_DISMISS = [
    InterventionAction(actionId="return_to_task", label="Return to Task"),
    InterventionAction(actionId="dismiss", label="I'm Fine"),
]

_BREAK_ACTIONS = [
    InterventionAction(actionId="take_break", label="Start 5-min Break"),
    InterventionAction(actionId="return_to_task", label="I'll Keep Going"),
    InterventionAction(actionId="dismiss", label="Dismiss"),
]


# ---------------------------------------------------------------------------
# Intervention decision (POST /api/intervene)
# ---------------------------------------------------------------------------

def decide_intervention(event: AttentionEvent) -> InterventionDecision:
    """
    Map AttentionEvent → InterventionDecision using deterministic rules.
    Never raises. Always returns a valid InterventionDecision.
    """
    # ── CONFIDENCE GATING ────────────────────────────────────────────────────
    # Low confidence (<0.50) indicates ambiguous or noisy sensor signals.
    # Be conservative: avoid false-positive user interruptions.
    if event.confidence < 0.50:
        return InterventionDecision(
            decisionId=_dec_id(),
            timestamp=_now_iso(),
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason=f"Confidence too low ({event.confidence:.2f}) — suppressing intervention",
        )

    state = event.attentionState
    metrics = event.metrics
    session_minutes = metrics.sessionDurationSeconds / 60

    # ── FOCUSED ─────────────────────────────────────────────────────────────
    if state == AttentionState.FOCUSED:
        # Suggest a break after sustained focus (≥ 90 min)
        if session_minutes >= 90:
            return InterventionDecision(
                decisionId=_dec_id(),
                timestamp=_now_iso(),
                shouldIntervene=True,
                level=InterventionLevel.LEVEL_4_BREAK_SUGGESTION,
                triggerReason=f"Sustained focus session of {int(session_minutes)} minutes",
                message=(
                    f"You've been focused for {int(session_minutes)} minutes — "
                    "impressive! Would a short break help you recharge?"
                ),
                actions=_BREAK_ACTIONS,
                suggestedBreakMinutes=5,
            )
        # No intervention needed — user is on track
        return InterventionDecision(
            decisionId=_dec_id(),
            timestamp=_now_iso(),
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="User is focused",
        )

    # ── POSSIBLY_DRIFTING ────────────────────────────────────────────────────
    if state == AttentionState.POSSIBLY_DRIFTING:
        app = event.activeApp.appName
        category = event.activeApp.category
        switch_count = metrics.recentSwitchCount
        app_duration = metrics.appDurationSeconds

        # Transient lookup check: brief switches (<30s) in work/utility/doc tools are natural
        if app_duration < 30 and category != "entertainment":
            return InterventionDecision(
                decisionId=_dec_id(),
                timestamp=_now_iso(),
                shouldIntervene=False,
                level=InterventionLevel.LEVEL_0_NONE,
                triggerReason=f"Transient lookup in {app} ({int(app_duration)}s) — allowing natural workflow",
            )

        # Entertainment apps (YouTube, Social Media) during focus session
        if category == "entertainment":
            return InterventionDecision(
                decisionId=_dec_id(),
                timestamp=_now_iso(),
                shouldIntervene=True,
                level=InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
                triggerReason=(
                    f"Leisure app ({app}) active during focus session "
                    f"with {switch_count} recent switches"
                ),
                message=(
                    f"Notice focus drifted to {app}. "
                    "Ready to jump back into your flow, or would a short break help?"
                ),
                actions=_STANDARD_ACTIONS,
            )

        # Productive multi-window workflow (IDE, Terminal, Documentation, Git GUI)
        if category in ("work", "utility"):
            # High switching among work tools (>=4) indicates active developer multi-tasking (Scenario A)
            # Suppress all interventions — do not interrupt active work
            if switch_count >= 4:
                return InterventionDecision(
                    decisionId=_dec_id(),
                    timestamp=_now_iso(),
                    shouldIntervene=False,
                    level=InterventionLevel.LEVEL_0_NONE,
                    triggerReason=f"Productive workflow switching ({switch_count} switches) across {category} tools",
                )

            # Low switch count (<4) but drifting for a sustained period in a non-primary window
            if app_duration >= 60:
                return InterventionDecision(
                    decisionId=_dec_id(),
                    timestamp=_now_iso(),
                    shouldIntervene=True,
                    level=InterventionLevel.LEVEL_1_GENTLE_REMINDER,
                    triggerReason=f"Slight drift detected with app: {app}",
                    message="Your attention may be wandering — no worries, it happens.",
                    actions=_RETURN_OR_DISMISS,
                )

            return InterventionDecision(
                decisionId=_dec_id(),
                timestamp=_now_iso(),
                shouldIntervene=False,
                level=InterventionLevel.LEVEL_0_NONE,
                triggerReason=f"Brief work activity in {app}",
            )

        # Unknown category with high switching
        if switch_count >= 4:
            return InterventionDecision(
                decisionId=_dec_id(),
                timestamp=_now_iso(),
                shouldIntervene=True,
                level=InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
                triggerReason=(
                    f"Frequent switching ({switch_count} times recently) "
                    f"with active app: {app}"
                ),
                message=(
                    "It looks like your focus may have shifted a little. "
                    "Would you like to get back to your task?"
                ),
                actions=_STANDARD_ACTIONS,
            )

        # Mild drift — gentle reminder
        return InterventionDecision(
            decisionId=_dec_id(),
            timestamp=_now_iso(),
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_1_GENTLE_REMINDER,
            triggerReason=f"Slight drift detected with app: {app}",
            message="Your attention may be wandering — no worries, it happens.",
            actions=_RETURN_OR_DISMISS,
        )

    # ── DISTRACTED ───────────────────────────────────────────────────────────
    if state == AttentionState.DISTRACTED:
        app = event.activeApp.appName
        category = event.activeApp.category

        # If user is in a work/utility app but marked distracted (e.g. hesitation/stuck), offer assistance
        if category in ("work", "utility"):
            return InterventionDecision(
                decisionId=_dec_id(),
                timestamp=_now_iso(),
                shouldIntervene=True,
                level=InterventionLevel.LEVEL_3_ASSISTANCE,
                triggerReason=f"Prolonged hesitation or stuck state in {app}",
                message="This task seems heavy. Want to break it into smaller steps?",
                actions=[
                    InterventionAction(actionId="break_down_task", label="Break into Steps"),
                    InterventionAction(actionId="return_to_task", label="Keep Working"),
                    InterventionAction(actionId="take_break", label="Take a Break"),
                    InterventionAction(actionId="dismiss", label="Dismiss"),
                ],
            )

        return InterventionDecision(
            decisionId=_dec_id(),
            timestamp=_now_iso(),
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
            triggerReason=f"Sustained distraction detected — active app: {app}",
            message=(
                "Looks like focus has drifted for a bit. "
                "Ready to get back to it, or would a short break help?"
            ),
            actions=_STANDARD_ACTIONS,
        )

    # ── RECOVERING ───────────────────────────────────────────────────────────
    if state == AttentionState.RECOVERING:
        return InterventionDecision(
            decisionId=_dec_id(),
            timestamp=_now_iso(),
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="User is recovering — no interruption needed",
        )

    # ── IDLE ─────────────────────────────────────────────────────────────────
    if state == AttentionState.IDLE:
        idle_seconds = metrics.inactivitySeconds
        if idle_seconds >= 300:  # 5+ minutes idle
            return InterventionDecision(
                decisionId=_dec_id(),
                timestamp=_now_iso(),
                shouldIntervene=True,
                level=InterventionLevel.LEVEL_1_GENTLE_REMINDER,
                triggerReason=f"Idle for {int(idle_seconds)} seconds",
                message=(
                    f"You've been away for {int(idle_seconds // 60)} minute(s). "
                    "Ready to dive back in?"
                ),
                actions=_RETURN_OR_DISMISS,
            )
        return InterventionDecision(
            decisionId=_dec_id(),
            timestamp=_now_iso(),
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="Brief idle — no intervention",
        )

    # Catch-all (should never be reached given the enum)
    return InterventionDecision(
        decisionId=_dec_id(),
        timestamp=_now_iso(),
        shouldIntervene=False,
        level=InterventionLevel.LEVEL_0_NONE,
        triggerReason="Unknown state — no intervention",
    )


# ---------------------------------------------------------------------------
# Task decomposition (POST /api/decompose)
# ---------------------------------------------------------------------------

def decompose_task(request: TaskDecompositionRequest) -> TaskDecompositionResponse:
    """
    Heuristic task breakdown: splits the description on conjunctions and common
    list markers, or falls back to a 4-step generic template.
    Never raises. Always returns a valid TaskDecompositionResponse.
    """
    task = request.taskDescription.strip()

    # Try to split on common list separators
    import re
    # Split on: " and ", " then ", " after that ", numbered bullets, commas in long strings
    parts = re.split(
        r"\s*(?:and then|, then|, and|then|,)\s+",
        task,
        flags=re.IGNORECASE,
    )
    parts = [p.strip().capitalize() for p in parts if p.strip()]

    # If splitting gave us ≤1 part, use a generic 4-step template
    if len(parts) <= 1:
        parts = [
            f"Plan and define the scope of: {task}",
            f"Gather resources and information needed for: {task}",
            f"Execute the main work for: {task}",
            f"Review and finalise: {task}",
        ]

    subtasks = [
        Subtask(
            stepNumber=i + 1,
            title=part,
            description=f"Complete this step as part of: {task}",
            estimatedMinutes=10,
            isImmediateNextStep=(i == 0),
        )
        for i, part in enumerate(parts)
    ]

    return TaskDecompositionResponse(originalTask=task, subtasks=subtasks)


# ---------------------------------------------------------------------------
# Recovery guidance (POST /api/recover)
# ---------------------------------------------------------------------------

_RECOVERY_MAP: dict[str, tuple[str, str, RecoveryActionPayload | None]] = {
    "tired": (
        "take_break",
        "It's okay to feel tired — rest is part of the process. "
        "A short 5-minute break can make a real difference.",
        RecoveryActionPayload(suggestedBreakMinutes=5),
    ),
    "task_confusing": (
        "simplify_task",
        "Complex tasks can feel overwhelming. "
        "Let's break it into smaller, clearer steps so you know exactly what to do next.",
        RecoveryActionPayload(suggestedNextAction="Break your task into 3 smaller steps"),
    ),
    "distracted": (
        "resume_previous",
        "Distractions happen to everyone. "
        "The important thing is you noticed. Ready to return to your task?",
        RecoveryActionPayload(suggestedNextAction="Return to your last active task"),
    ),
    "need_break": (
        "take_break",
        "Taking a break is a smart move, not a setback. "
        "Step away, recharge, and you'll come back sharper.",
        RecoveryActionPayload(suggestedBreakMinutes=5),
    ),
    "other": (
        "custom_tip",
        "Whatever's going on, it's okay. "
        "Take a moment, then decide what feels right: continue, break, or ask for help.",
        None,
    ),
}


def guide_recovery(request: RecoveryFeedbackRequest) -> RecoveryFeedbackResponse:
    """
    Map user-reported recovery reason → supportive guidance.
    Never raises. Always returns a valid RecoveryFeedbackResponse.
    """
    reason = request.userReason
    recommendation, message, payload = _RECOVERY_MAP.get(
        reason, _RECOVERY_MAP["other"]
    )
    return RecoveryFeedbackResponse(
        recommendation=recommendation,  # type: ignore[arg-type]
        supportiveMessage=message,
        actionPayload=payload,
    )
