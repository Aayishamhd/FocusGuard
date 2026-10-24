"""Output validation, JSON sanitization, and schema normalization."""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from ..models import (
    ActionId,
    InterventionAction,
    InterventionDecision,
    InterventionLevel,
    RecoveryActionPayload,
    RecoveryFeedbackResponse,
    RecoveryRecommendation,
    SubTask,
    TaskDecompositionResponse,
)
from .safety_filter import is_text_safe, sanitize_user_facing_text

logger = logging.getLogger("focusguard.assistant.validator")


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def safe_parse_json(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    Parse JSON from raw model output.
    Handles raw JSON, markdown code blocks (```json ... ```), and embedded JSON objects.
    """
    if not raw_text or not isinstance(raw_text, str):
        return None

    cleaned = raw_text.strip()

    # Try direct parse
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # Strip surrounding markdown code fence
    fence_pattern = r"^```(?:json)?\s*\n?(.*?)\n?```$"
    match = re.match(fence_pattern, cleaned, flags=re.DOTALL | re.IGNORECASE)
    if match:
        inner = match.group(1).strip()
        try:
            data = json.loads(inner)
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    # Find the outermost balanced JSON object {...}
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        candidate = cleaned[start_idx : end_idx + 1]
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    logger.warning("Failed to parse JSON from model output.")
    return None


def validate_and_normalize_intervention(
    raw_data: Any,
    fallback_reason: str = "Evaluated attention signals.",
) -> Optional[InterventionDecision]:
    """
    Validate, sanitize, and normalize model intervention output into InterventionDecision.
    Returns None if output is fundamentally invalid or unfixable.
    """
    data = safe_parse_json(raw_data) if isinstance(raw_data, str) else raw_data
    if not isinstance(data, dict):
        return None

    try:
        # Normalize decisionId and timestamp
        decision_id = data.get("decisionId") or f"dec-{uuid.uuid4().hex[:12]}"
        timestamp = data.get("timestamp") or utc_now_iso()

        # Normalize intervention level
        level_raw = data.get("level", "LEVEL_0_NONE")
        try:
            level = InterventionLevel(level_raw)
        except ValueError:
            return None

        should_intervene = bool(data.get("shouldIntervene", False))
        trigger_reason = str(data.get("triggerReason") or fallback_reason).strip()

        # Handle Level 0: No intervention
        if level == InterventionLevel.LEVEL_0_NONE:
            return InterventionDecision(
                decisionId=decision_id,
                timestamp=timestamp,
                shouldIntervene=False,
                level=InterventionLevel.LEVEL_0_NONE,
                triggerReason=trigger_reason,
                message=None,
                actions=None,
            )

        # Sanitize message
        raw_message = data.get("message")
        safe_message = sanitize_user_facing_text(
            raw_message,
            default_fallback="Would you like help returning to your primary task?",
        )

        # Validate actions
        raw_actions = data.get("actions") or []
        valid_actions: List[InterventionAction] = []
        for act in raw_actions:
            if isinstance(act, dict) and "actionId" in act and "label" in act:
                try:
                    aid = ActionId(act["actionId"])
                    lbl = str(act["label"]).strip()
                    if is_text_safe(lbl):
                        valid_actions.append(InterventionAction(actionId=aid, label=lbl))
                except ValueError:
                    continue

        if not valid_actions and should_intervene:
            valid_actions = [
                InterventionAction(actionId=ActionId.RETURN_TO_TASK, label="Back to Task"),
                InterventionAction(actionId=ActionId.DISMISS, label="Dismiss"),
            ]

        suggested_break = data.get("suggestedBreakMinutes")
        if level == InterventionLevel.LEVEL_4_BREAK_SUGGESTION and not suggested_break:
            suggested_break = 5

        return InterventionDecision(
            decisionId=decision_id,
            timestamp=timestamp,
            shouldIntervene=should_intervene,
            level=level,
            triggerReason=trigger_reason,
            message=safe_message,
            actions=valid_actions,
            suggestedBreakMinutes=suggested_break,
        )
    except Exception as e:
        logger.warning("Intervention validation failed: %s", e)
        return None


def validate_and_normalize_decomposition(
    raw_data: Any,
    original_task: str,
) -> Optional[TaskDecompositionResponse]:
    """
    Validate and normalize task decomposition output.
    Ensures sequential step numbers, positive duration estimates, and exactly one immediate next step.
    """
    data = safe_parse_json(raw_data) if isinstance(raw_data, str) else raw_data
    if not isinstance(data, dict):
        return None

    raw_subtasks = data.get("subtasks")
    if not isinstance(raw_subtasks, list) or len(raw_subtasks) == 0:
        return None

    normalized_subtasks: List[SubTask] = []
    immediate_step_indices: List[int] = []

    for idx, item in enumerate(raw_subtasks):
        if not isinstance(item, dict):
            continue

        raw_title = str(item.get("title", "")).strip()
        raw_desc = str(item.get("description", "")).strip()

        if not raw_title or not raw_desc:
            continue

        # Check safety
        if not is_text_safe(raw_title) or not is_text_safe(raw_desc):
            logger.warning("Unsafe subtask detected; rejecting model decomposition.")
            return None

        # Estimated minutes must be positive int
        try:
            est_mins = int(item.get("estimatedMinutes", 10))
            if est_mins < 1:
                est_mins = 5
        except (ValueError, TypeError):
            est_mins = 10

        is_immediate = bool(item.get("isImmediateNextStep", False))
        if is_immediate:
            immediate_step_indices.append(idx)

        normalized_subtasks.append(
            SubTask(
                stepNumber=idx + 1,  # Ensure strict sequential numbering
                title=raw_title,
                description=raw_desc,
                estimatedMinutes=est_mins,
                isImmediateNextStep=is_immediate,
            )
        )

    if not normalized_subtasks:
        return None

    # Enforce exactly one isImmediateNextStep
    if len(immediate_step_indices) == 1:
        # Already exactly one
        pass
    elif len(immediate_step_indices) > 1:
        # Keep only the first one
        first_idx = immediate_step_indices[0]
        for idx, st in enumerate(normalized_subtasks):
            st.isImmediateNextStep = (idx == first_idx)
    else:
        # None marked, default the very first step
        normalized_subtasks[0].isImmediateNextStep = True

    try:
        return TaskDecompositionResponse(
            originalTask=original_task.strip(),
            subtasks=normalized_subtasks,
        )
    except ValidationError as e:
        logger.warning("Task decomposition validation error: %s", e)
        return None


def validate_and_normalize_recovery(
    raw_data: Any,
) -> Optional[RecoveryFeedbackResponse]:
    """Validate and normalize recovery feedback response."""
    data = safe_parse_json(raw_data) if isinstance(raw_data, str) else raw_data
    if not isinstance(data, dict):
        return None

    try:
        raw_rec = data.get("recommendation", "take_break")
        try:
            recommendation = RecoveryRecommendation(raw_rec)
        except ValueError:
            return None

        raw_msg = str(data.get("supportiveMessage", "")).strip()
        safe_msg = sanitize_user_facing_text(
            raw_msg,
            default_fallback="Take a peaceful moment to reset your focus. You are doing fine.",
        )

        action_payload = None
        raw_payload = data.get("actionPayload")
        if isinstance(raw_payload, dict):
            break_mins = raw_payload.get("suggestedBreakMinutes")
            if break_mins is not None:
                try:
                    break_mins = max(1, int(break_mins))
                except (ValueError, TypeError):
                    break_mins = None

            next_action = raw_payload.get("suggestedNextAction")
            if next_action is not None:
                next_action = sanitize_user_facing_text(str(next_action), "Take one small step forward.")

            action_payload = RecoveryActionPayload(
                suggestedBreakMinutes=break_mins,
                suggestedNextAction=next_action,
            )

        return RecoveryFeedbackResponse(
            recommendation=recommendation,
            supportiveMessage=safe_msg,
            actionPayload=action_payload,
        )
    except Exception as e:
        logger.warning("Recovery validation failed: %s", e)
        return None
