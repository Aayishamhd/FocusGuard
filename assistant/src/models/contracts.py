"""
assistant/src/models/contracts.py

Pydantic v2 models that mirror SHARED_CONTRACTS.md (v1.0.0) exactly.

IMPORTANT: These models are the authoritative Python representation of the
frozen shared contracts. Do NOT rename fields, change types, or add required
fields without team consensus (changes must first be made to SHARED_CONTRACTS.md).

Optional fields may be added with `Optional[T] = None` to remain backward-compatible.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# 2.1  AttentionState
# ---------------------------------------------------------------------------

class AttentionState(str, Enum):
    FOCUSED = "FOCUSED"
    POSSIBLY_DRIFTING = "POSSIBLY_DRIFTING"
    DISTRACTED = "DISTRACTED"
    RECOVERING = "RECOVERING"
    IDLE = "IDLE"


# ---------------------------------------------------------------------------
# 2.2  AttentionEvent  (input — produced by Feature 1, consumed by us)
# ---------------------------------------------------------------------------

class ActiveApp(BaseModel):
    appName: str
    windowTitle: str
    category: Literal["work", "communication", "entertainment", "utility", "unknown"]


class AttentionMetrics(BaseModel):
    sessionDurationSeconds: float
    appDurationSeconds: float
    recentSwitchCount: int
    inactivitySeconds: float
    webcamEngaged: Optional[bool] = None


class AttentionEvent(BaseModel):
    eventId: str
    timestamp: str  # ISO 8601 string
    attentionState: AttentionState
    confidence: float = Field(ge=0.0, le=1.0)
    activeApp: ActiveApp
    metrics: AttentionMetrics
    sources: List[Literal["window_tracker", "activity_monitor", "webcam_headpose"]]


# ---------------------------------------------------------------------------
# 2.3  InterventionDecision  (output — produced by us, consumed by Feature 3)
# ---------------------------------------------------------------------------

class InterventionLevel(str, Enum):
    LEVEL_0_NONE = "LEVEL_0_NONE"
    LEVEL_1_GENTLE_REMINDER = "LEVEL_1_GENTLE_REMINDER"
    LEVEL_2_RECOVERY_SUGGESTION = "LEVEL_2_RECOVERY_SUGGESTION"
    LEVEL_3_ASSISTANCE = "LEVEL_3_ASSISTANCE"
    LEVEL_4_BREAK_SUGGESTION = "LEVEL_4_BREAK_SUGGESTION"


class InterventionAction(BaseModel):
    actionId: Literal["return_to_task", "break_down_task", "take_break", "dismiss"]
    label: str


class InterventionDecision(BaseModel):
    decisionId: str = Field(default_factory=lambda: f"dec-{uuid.uuid4().hex[:8]}")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    shouldIntervene: bool
    level: InterventionLevel
    triggerReason: str
    message: Optional[str] = None
    actions: Optional[List[InterventionAction]] = None
    suggestedBreakMinutes: Optional[int] = None


# ---------------------------------------------------------------------------
# 2.4  TaskDecomposition  (Feature 3 → us → Feature 3)
# ---------------------------------------------------------------------------

class TaskDecompositionRequest(BaseModel):
    taskDescription: str
    difficultyLevel: Optional[Literal["quick", "moderate", "complex"]] = None
    existingSubtasks: Optional[List[str]] = None


class Subtask(BaseModel):
    stepNumber: int
    title: str
    description: str
    estimatedMinutes: int
    isImmediateNextStep: bool


class TaskDecompositionResponse(BaseModel):
    originalTask: str
    subtasks: List[Subtask]


# ---------------------------------------------------------------------------
# 2.5  FocusRecovery  (Feature 3 → us → Feature 3)
# ---------------------------------------------------------------------------

UserReason = Literal["tired", "task_confusing", "distracted", "need_break", "other"]
RecoveryRecommendation = Literal[
    "take_break", "simplify_task", "resume_previous", "custom_tip"
]


class RecoveryActionPayload(BaseModel):
    suggestedBreakMinutes: Optional[int] = None
    suggestedNextAction: Optional[str] = None


class RecoveryFeedbackRequest(BaseModel):
    sessionId: str
    currentTask: str
    userReason: UserReason
    notes: Optional[str] = None


class RecoveryFeedbackResponse(BaseModel):
    recommendation: RecoveryRecommendation
    supportiveMessage: str
    actionPayload: Optional[RecoveryActionPayload] = None


# ---------------------------------------------------------------------------
# Health response
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    llmConnected: bool
    model: str
    fallbackMode: bool
