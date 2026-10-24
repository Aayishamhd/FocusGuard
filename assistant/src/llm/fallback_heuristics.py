"""Deterministic rule-based heuristics and offline fallbacks."""

import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from ..models import (
    ActionId,
    AppCategory,
    AttentionEvent,
    AttentionState,
    InterventionAction,
    InterventionDecision,
    InterventionLevel,
    RecoveryActionPayload,
    RecoveryFeedbackResponse,
    RecoveryRecommendation,
    RecoveryUserReason,
    SubTask,
    TaskDecompositionResponse,
)


def utc_now_iso() -> str:
    """Return the current UTC timestamp formatted as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def generate_smallest_next_step(task_description: str) -> str:
    """Generate the smallest immediate concrete micro-action for a task."""
    desc = task_description.strip()
    if not desc:
        return "Open your editor or notebook and write down the single first bullet point."
    return f"Open your primary document or tool and write the first single line or bullet point for '{desc}'."


def evaluate_intervention_heuristic(
    event: AttentionEvent,
    cooldown_active: bool = False,
) -> InterventionDecision:
    """
    Deterministic rule-based decision engine for intervention.
    Enforces safe intervention eligibility, level, and empathetic suggestions.
    """
    decision_id = f"dec-{uuid.uuid4().hex[:12]}"
    now_ts = utc_now_iso()

    # Rule 0: Cooldown suppression
    if cooldown_active:
        return InterventionDecision(
            decisionId=decision_id,
            timestamp=now_ts,
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="Intervention suppressed due to active cooldown window.",
        )

    # Rule 1: Ambiguous or missing context / very low confidence
    if event.confidence < 0.35 or (
        event.activeApp.category == AppCategory.UNKNOWN
        and event.attentionState == AttentionState.IDLE
        and event.metrics.inactivitySeconds < 30
    ):
        return InterventionDecision(
            decisionId=decision_id,
            timestamp=now_ts,
            shouldIntervene=False,
            level=InterventionLevel.LEVEL_0_NONE,
            triggerReason="Contextual telemetry is ambiguous or low confidence; holding intervention.",
        )

    # Rule 2: Prolonged continuous focus (> 90 minutes / 5400s) -> LEVEL_4_BREAK_SUGGESTION
    if event.metrics.sessionDurationSeconds >= 5400:
        minutes = int(event.metrics.sessionDurationSeconds // 60)
        return InterventionDecision(
            decisionId=decision_id,
            timestamp=now_ts,
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_4_BREAK_SUGGESTION,
            triggerReason=f"Continuous focus duration ({minutes}m) exceeded 90 minutes.",
            message=f"You've been in deep focus for {minutes} minutes. A quick 5-minute break helps maintain your clarity and prevent mental fatigue.",
            suggestedBreakMinutes=5,
            actions=[
                InterventionAction(actionId=ActionId.TAKE_BREAK, label="Take 5-min Break"),
                InterventionAction(actionId=ActionId.DISMISS, label="Keep Focusing"),
            ],
        )

    # Rule 3: Sustained distraction or entertainment application -> LEVEL_2_RECOVERY_SUGGESTION
    is_entertainment = event.activeApp.category == AppCategory.ENTERTAINMENT
    high_switches = event.metrics.recentSwitchCount >= 4
    explicit_distracted = event.attentionState == AttentionState.DISTRACTED

    if explicit_distracted or is_entertainment or (high_switches and event.activeApp.category != AppCategory.WORK):
        app_name = event.activeApp.appName or "another application"
        reason = (
            f"Active app switched to {app_name} ({event.activeApp.category.value})"
            if is_entertainment
            else f"Detected {event.metrics.recentSwitchCount} rapid application switches"
        )
        return InterventionDecision(
            decisionId=decision_id,
            timestamp=now_ts,
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
            triggerReason=reason,
            message=f"Your attention shifted over to {app_name}. Ready to jump back to your core task?",
            actions=[
                InterventionAction(actionId=ActionId.RETURN_TO_TASK, label="Back to Task"),
                InterventionAction(actionId=ActionId.BREAK_DOWN_TASK, label="Break into Smaller Steps"),
                InterventionAction(actionId=ActionId.TAKE_BREAK, label="Take a 5-min Break"),
                InterventionAction(actionId=ActionId.DISMISS, label="Still Focused"),
            ],
        )

    # Rule 4: Stuck state or task confusion -> LEVEL_3_ASSISTANCE
    # Rapid switching within work apps or recovering state indicates feeling stuck
    if (
        event.attentionState == AttentionState.RECOVERING
        or (high_switches and event.activeApp.category in (AppCategory.WORK, AppCategory.UTILITY))
    ):
        return InterventionDecision(
            decisionId=decision_id,
            timestamp=now_ts,
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_3_ASSISTANCE,
            triggerReason="Frequent switching within work tools suggests task friction or feeling stuck.",
            message="This step seems challenging or heavy. Would breaking it down into 3 bite-sized steps help?",
            actions=[
                InterventionAction(actionId=ActionId.BREAK_DOWN_TASK, label="Break into Steps"),
                InterventionAction(actionId=ActionId.TAKE_BREAK, label="Step Away for 5 Mins"),
                InterventionAction(actionId=ActionId.DISMISS, label="I'm Making Progress"),
            ],
        )

    # Rule 5: Slight drift or noticeable idle hesitation -> LEVEL_1_GENTLE_REMINDER
    if event.attentionState == AttentionState.POSSIBLY_DRIFTING or event.metrics.inactivitySeconds >= 120:
        return InterventionDecision(
            decisionId=decision_id,
            timestamp=now_ts,
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_1_GENTLE_REMINDER,
            triggerReason=f"Inactivity or mild drift detected ({int(event.metrics.inactivitySeconds)}s idle).",
            message="Looks like your focus might have paused for a moment. Would you like to resume your flow?",
            actions=[
                InterventionAction(actionId=ActionId.RETURN_TO_TASK, label="Resume Flow"),
                InterventionAction(actionId=ActionId.DISMISS, label="Just Thinking"),
            ],
        )

    # Default: Stable work / Productive lookup -> LEVEL_0_NONE
    return InterventionDecision(
        decisionId=decision_id,
        timestamp=now_ts,
        shouldIntervene=False,
        level=InterventionLevel.LEVEL_0_NONE,
        triggerReason="Stable work or productive lookup detected. User is in active flow.",
    )


def decompose_task_heuristic(
    task_description: str,
    difficulty: Optional[str] = None,
) -> TaskDecompositionResponse:
    """
    Deterministic task decomposition producing 3-5 ordered, actionable subtasks.
    Ensures sequential numbering and exactly one immediate next step.
    """
    clean_task = task_description.strip()

    # Heuristic 1: Conjunction and punctuation splitting
    split_pattern = r"\s+(?:and\s+then|then|followed\s+by|after\s+that|and)\s+|[;,]\s*"
    parts = [p.strip() for p in re.split(split_pattern, clean_task, flags=re.IGNORECASE) if len(p.strip()) > 3]

    subtasks: List[SubTask] = []

    if len(parts) >= 2 and len(parts) <= 5:
        for idx, part in enumerate(parts):
            cap_part = part[0].upper() + part[1:] if len(part) > 1 else part.upper()
            is_first = idx == 0
            mins = 5 if is_first else (15 if idx < len(parts) - 1 else 10)
            subtasks.append(
                SubTask(
                    stepNumber=idx + 1,
                    title=f"Step {idx + 1}: {cap_part[:40]}",
                    description=f"{cap_part}. Keep it focused and concrete.",
                    estimatedMinutes=mins,
                    isImmediateNextStep=is_first,
                )
            )
    else:
        # Heuristic 2: Contextual 4-step template based on task text
        subtasks = [
            SubTask(
                stepNumber=1,
                title="Prepare workspace & clarify scope",
                description=f"Open relevant files or tools for '{clean_task}' and jot down 2 key requirements.",
                estimatedMinutes=5,
                isImmediateNextStep=True,
            ),
            SubTask(
                stepNumber=2,
                title="Draft structure & initial outline",
                description=f"Create the basic structure, outline, or wireframe for '{clean_task}'.",
                estimatedMinutes=15,
                isImmediateNextStep=False,
            ),
            SubTask(
                stepNumber=3,
                title="Implement core components",
                description=f"Focus on the main substance of '{clean_task}' without worrying about final perfection.",
                estimatedMinutes=25,
                isImmediateNextStep=False,
            ),
            SubTask(
                stepNumber=4,
                title="Review, verify, and polish",
                description=f"Review the results for '{clean_task}', make quick refinements, and verify completion.",
                estimatedMinutes=10,
                isImmediateNextStep=False,
            ),
        ]

    # Guarantee: exactly one isImmediateNextStep
    has_next = False
    for st in subtasks:
        if st.isImmediateNextStep:
            if not has_next:
                has_next = True
            else:
                st.isImmediateNextStep = False
    if not has_next and subtasks:
        subtasks[0].isImmediateNextStep = True

    return TaskDecompositionResponse(
        originalTask=clean_task,
        subtasks=subtasks,
    )


def recovery_feedback_heuristic(
    user_reason: RecoveryUserReason,
    current_task: str = "",
    notes: Optional[str] = None,
) -> RecoveryFeedbackResponse:
    """
    Empathetic, non-judgmental recovery coaching based on user reported friction.
    """
    task_name = current_task.strip() or "your current task"

    if user_reason == RecoveryUserReason.TIRED:
        return RecoveryFeedbackResponse(
            recommendation=RecoveryRecommendation.TAKE_BREAK,
            supportiveMessage="Working while exhausted drains your focus further. A quick 5-minute breather will help reset your mental energy.",
            actionPayload=RecoveryActionPayload(
                suggestedBreakMinutes=5,
                suggestedNextAction="Step away from the screen, hydrate, and stretch.",
            ),
        )

    if user_reason == RecoveryUserReason.TASK_CONFUSING:
        return RecoveryFeedbackResponse(
            recommendation=RecoveryRecommendation.SIMPLIFY_TASK,
            supportiveMessage="When a task feels confusing or overwhelming, shrinking it down to a micro-action clears the fog.",
            actionPayload=RecoveryActionPayload(
                suggestedNextAction=f"Write down 1 concrete sentence describing what needs to happen next for '{task_name}'.",
            ),
        )

    if user_reason == RecoveryUserReason.DISTRACTED:
        return RecoveryFeedbackResponse(
            recommendation=RecoveryRecommendation.RESUME_PREVIOUS,
            supportiveMessage="Attention drifts happen naturally to all of us. No guilt needed—let's ease back into your rhythm.",
            actionPayload=RecoveryActionPayload(
                suggestedNextAction=f"Switch back to {task_name} and commit to just 3 focused minutes.",
            ),
        )

    if user_reason == RecoveryUserReason.NEED_BREAK:
        return RecoveryFeedbackResponse(
            recommendation=RecoveryRecommendation.TAKE_BREAK,
            supportiveMessage="Taking planned breaks is essential for sustainable productivity. Enjoy your rest completely guilt-free.",
            actionPayload=RecoveryActionPayload(
                suggestedBreakMinutes=10,
                suggestedNextAction="Step outside or close your eyes for a few peaceful minutes.",
            ),
        )

    # user_reason == RecoveryUserReason.OTHER or unhandled
    return RecoveryFeedbackResponse(
        recommendation=RecoveryRecommendation.CUSTOM_TIP,
        supportiveMessage="Take a deep breath and give yourself permission to reset. Choose whichever gentle action feels easiest right now.",
        actionPayload=RecoveryActionPayload(
            suggestedBreakMinutes=5,
            suggestedNextAction=f"Decide whether to pause for 5 minutes or take one small step on '{task_name}'.",
        ),
    )
