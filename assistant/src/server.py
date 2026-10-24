"""
assistant/src/server.py

FastAPI application — Feature 2: AI Assistant & Human-Centered Intervention
Listens on http://127.0.0.1:5002 (configurable via .env)

Routes (all defined in SHARED_CONTRACTS.md §3):
    GET  /health            → HealthResponse
    POST /api/intervene     → InterventionDecision
    POST /api/decompose     → TaskDecompositionResponse
    POST /api/recover       → RecoveryFeedbackResponse

All routes:
  - Are async.
  - Never return HTTP 500 to callers — errors are caught in the service layer
    and converted to valid fallback responses.
  - Validate request bodies automatically via Pydantic v2.
  - Return responses validated against the shared contract models.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models.contracts import (
    AttentionEvent,
    HealthResponse,
    InterventionDecision,
    RecoveryFeedbackRequest,
    RecoveryFeedbackResponse,
    TaskDecompositionRequest,
    TaskDecompositionResponse,
)
from .services.assistant_service import assistant_service

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("focusguard.assistant")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="FocusGuard — AI Assistant Service",
    description=(
        "Feature 2: AI reasoning layer. "
        "Converts attention signals into gentle, human-centered interventions. "
        "Port 5002 | Branch: feat/ai-assistant | Sandbox: /assistant"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow Electron renderer / localhost to call us during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:*", "http://127.0.0.1:*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health check",
    tags=["system"],
)
async def health() -> HealthResponse:
    """
    Returns current service status and LLM connectivity.
    Feature 3 polls this on startup to determine if the assistant is available.
    """
    return await assistant_service.health()


@app.post(
    "/api/intervene",
    response_model=InterventionDecision,
    summary="Evaluate attention event and decide whether to intervene",
    tags=["assistant"],
)
async def intervene(event: AttentionEvent) -> InterventionDecision:
    """
    Accepts an `AttentionEvent` (forwarded by Feature 3 from Feature 1).
    Returns an `InterventionDecision` with `shouldIntervene`, level, message,
    and optional action buttons.

    The AI may choose NOT to intervene (shouldIntervene=false, LEVEL_0_NONE)
    even when distraction signals are present — over-intervention degrades UX.
    """
    logger.info(
        "intervene called | state=%s confidence=%.2f app=%s",
        event.attentionState,
        event.confidence,
        event.activeApp.appName,
    )
    return await assistant_service.intervene(event)


@app.post(
    "/api/decompose",
    response_model=TaskDecompositionResponse,
    summary="Break a task into actionable subtasks",
    tags=["assistant"],
)
async def decompose(request: TaskDecompositionRequest) -> TaskDecompositionResponse:
    """
    Accepts a `TaskDecompositionRequest` with a task description.
    Returns a structured list of subtasks, with the smallest immediate next step
    flagged as `isImmediateNextStep=true`.
    """
    logger.info("decompose called | task=%r", request.taskDescription[:80])
    return await assistant_service.decompose(request)


@app.post(
    "/api/recover",
    response_model=RecoveryFeedbackResponse,
    summary="Provide supportive recovery guidance based on user feedback",
    tags=["assistant"],
)
async def recover(request: RecoveryFeedbackRequest) -> RecoveryFeedbackResponse:
    """
    Accepts a `RecoveryFeedbackRequest` containing the user's self-reported
    reason for distraction (tired / task_confusing / distracted / need_break / other).
    Returns personalised, supportive guidance. Never shames or diagnoses.
    """
    logger.info(
        "recover called | reason=%s task=%r",
        request.userReason,
        request.currentTask[:60],
    )
    return await assistant_service.recover(request)


# ---------------------------------------------------------------------------
# Entry point — run directly: python -m src.server
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    logger.info(
        "Starting FocusGuard AI Assistant on %s:%s",
        settings.assistant_host,
        settings.assistant_port,
    )
    uvicorn.run(
        "src.server:app",
        host=settings.assistant_host,
        port=settings.assistant_port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
