"""Pydantic models matching docs/SHARED_CONTRACTS.md."""

from enum import Enum
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================================
# Section 2.1 & 2.2: Attention State and Event
# ============================================================================

class AttentionState(str, Enum):
    FOCUSED = "FOCUSED"
    POSSIBLY_DRIFTING = "POSSIBLY_DRIFTING"
    DISTRACTED = "DISTRACTED"
    RECOVERING = "RECOVERING"
    IDLE = "IDLE"


class AppCategory(str, Enum):
    WORK = "work"
    COMMUNICATION = "communication"
    ENTERTAINMENT = "entertainment"
    UTILITY = "utility"
    UNKNOWN = "unknown"


class SourceType(str, Enum):
    WINDOW_TRACKER = "window_tracker"
    ACTIVITY_MONITOR = "activity_monitor"
    WEBCAM_HEADPOSE = "webcam_headpose"


class ActiveApp(BaseModel):
    model_config = ConfigDict(extra="ignore")

    appName: str = Field(..., description="Application name, e.g. Code, Google Chrome")
    windowTitle: str = Field(..., description="Sanitized window title")
    category: AppCategory = Field(default=AppCategory.UNKNOWN, description="Application category")


class AttentionMetrics(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sessionDurationSeconds: float = Field(..., ge=0, description="Total active session time in seconds")
    appDurationSeconds: float = Field(..., ge=0, description="Time spent on the current app")
    recentSwitchCount: int = Field(..., ge=0, description="App switches in the last 5 minutes")
    inactivitySeconds: float = Field(..., ge=0, description="Continuous seconds of no input")
    webcamEngaged: Optional[bool] = Field(default=False, description="Webcam focus flag")


class AttentionEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    eventId: str = Field(..., description="Unique event identifier (UUID)")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    attentionState: AttentionState = Field(..., description="Inferred attention state")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score 0.0 to 1.0")
    activeApp: ActiveApp = Field(..., description="Current active application details")
    metrics: AttentionMetrics = Field(..., description="Session metrics")
    sources: List[SourceType] = Field(default_factory=list, description="Telemetry sources")


# ============================================================================
# Section 2.3: Intervention Decision
# ============================================================================

class InterventionLevel(str, Enum):
    LEVEL_0_NONE = "LEVEL_0_NONE"
    LEVEL_1_GENTLE_REMINDER = "LEVEL_1_GENTLE_REMINDER"
    LEVEL_2_RECOVERY_SUGGESTION = "LEVEL_2_RECOVERY_SUGGESTION"
    LEVEL_3_ASSISTANCE = "LEVEL_3_ASSISTANCE"
    LEVEL_4_BREAK_SUGGESTION = "LEVEL_4_BREAK_SUGGESTION"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            v_upper = value.upper()
            if v_upper in ("LEVEL_0_NO_INTERVENTION", "NO_INTERVENTION", "LEVEL_0"):
                return cls.LEVEL_0_NONE
            for member in cls:
                if member.value == v_upper:
                    return member
        return None


class ActionId(str, Enum):
    RETURN_TO_TASK = "return_to_task"
    BREAK_DOWN_TASK = "break_down_task"
    TAKE_BREAK = "take_break"
    DISMISS = "dismiss"


class InterventionAction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    actionId: ActionId = Field(..., description="Standardized action identifier")
    label: str = Field(..., description="User-facing button label")


class InterventionDecision(BaseModel):
    model_config = ConfigDict(extra="ignore")

    decisionId: str = Field(..., description="UUIDv4 identifier for decision")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    shouldIntervene: bool = Field(..., description="Whether desktop UI should intervene")
    level: InterventionLevel = Field(..., description="Intervention severity level")
    triggerReason: str = Field(..., description="Technical or contextual trigger explanation")
    message: Optional[str] = Field(default=None, description="Gentle, non-shaming user-facing copy")
    actions: Optional[List[InterventionAction]] = Field(default=None, description="Actionable buttons")
    suggestedBreakMinutes: Optional[int] = Field(default=None, ge=1, description="Present if LEVEL_4")


# ============================================================================
# Section 2.4: Task Decomposition
# ============================================================================

DifficultyLevel = Literal["quick", "moderate", "complex"]


class TaskDecompositionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    taskDescription: str = Field(..., min_length=1, max_length=1000, description="Task goal description")
    difficultyLevel: Optional[DifficultyLevel] = Field(default=None, description="Task complexity hint")
    existingSubtasks: Optional[List[str]] = Field(default=None, description="Already completed or planned subtasks")

    @field_validator("taskDescription")
    @classmethod
    def validate_task_description(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("taskDescription cannot be empty or whitespace only")
        return stripped


class SubTask(BaseModel):
    model_config = ConfigDict(extra="ignore")

    stepNumber: int = Field(..., ge=1, description="Sequential step index starting at 1")
    title: str = Field(..., min_length=1, description="Short subtask title")
    description: str = Field(..., min_length=1, description="Concrete subtask instruction")
    estimatedMinutes: int = Field(..., ge=1, description="Sensible time estimate in minutes")
    isImmediateNextStep: bool = Field(default=False, description="True for exactly one smallest first step")


class TaskDecompositionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    originalTask: str = Field(..., description="The original task description")
    subtasks: List[SubTask] = Field(..., min_length=1, description="Ordered list of actionable subtasks")


# ============================================================================
# Section 2.5: Recovery Feedback
# ============================================================================

class RecoveryUserReason(str, Enum):
    TIRED = "tired"
    TASK_CONFUSING = "task_confusing"
    DISTRACTED = "distracted"
    NEED_BREAK = "need_break"
    OTHER = "other"


class RecoveryFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sessionId: str = Field(default="default-session", description="Active session ID")
    currentTask: str = Field(default="", description="Task being worked on")
    userReason: RecoveryUserReason = Field(..., description="Reason reported by user")
    notes: Optional[str] = Field(default=None, max_length=500, description="Optional user notes")


class RecoveryRecommendation(str, Enum):
    TAKE_BREAK = "take_break"
    SIMPLIFY_TASK = "simplify_task"
    RESUME_PREVIOUS = "resume_previous"
    CUSTOM_TIP = "custom_tip"


class RecoveryActionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    suggestedBreakMinutes: Optional[int] = Field(default=None, ge=1)
    suggestedNextAction: Optional[str] = Field(default=None)


class RecoveryFeedbackResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    recommendation: RecoveryRecommendation = Field(..., description="Recommended focus recovery path")
    supportiveMessage: str = Field(..., description="Empathetic, non-judgmental guidance")
    actionPayload: Optional[RecoveryActionPayload] = Field(default=None, description="Action parameters")


# ============================================================================
# Health Check Response
# ============================================================================

class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str = Field(default="ok")
    llmConnected: bool = Field(..., description="Ollama reachable and configured model present")
    model: str = Field(..., description="Configured model identifier")
    fallbackMode: bool = Field(..., description="True if offline heuristic fallback active")
