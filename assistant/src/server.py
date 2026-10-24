"""FastAPI server for FocusGuard AI Assistant service (Port 5002)."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .models import (
    AttentionEvent,
    HealthResponse,
    InterventionDecision,
    RecoveryFeedbackRequest,
    RecoveryFeedbackResponse,
    TaskDecompositionRequest,
    TaskDecompositionResponse,
)
from .services.assistant_service import AssistantService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("focusguard.assistant.server")

# Service instance
service = AssistantService()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for startup discovery and graceful shutdown."""
    logger.info("Initializing FocusGuard Assistant on http://%s:%d", settings.assistant_host, settings.assistant_port)
    logger.info("Configured Ollama target: %s (model: %s)", settings.ollama_host, settings.ollama_model)

    # Perform initial non-blocking connectivity check
    try:
        health = await service.get_health()
        if health.llmConnected:
            logger.info("Ollama is reachable and model '%s' is ready.", health.model)
        else:
            logger.info("Ollama offline or model not found. Operating in heuristic fallback mode.")
    except Exception as e:
        logger.warning("Error during startup health check: %s. Continuing in fallback mode.", e)

    yield

    # Shutdown
    logger.info("Shutting down FocusGuard Assistant...")
    await service.ollama.close()


app = FastAPI(
    title="FocusGuard AI Assistant Service",
    description="Privacy-first AI reasoning and human-centered intervention engine.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS restricted to loopback and local development origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ============================================================================
# Exception Handlers
# ============================================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Sanitized validation error handler preventing internal traceback leaks."""
    errors = []
    for err in exc.errors():
        field_name = " -> ".join(str(loc) for loc in err.get("loc", []))
        errors.append(f"{field_name}: {err.get('msg', 'invalid value')}")
    logger.warning("Request validation error on %s: %s", request.url.path, errors)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT if hasattr(status, "HTTP_422_UNPROCESSABLE_CONTENT") else 422,
        content={
            "error": "Validation Error",
            "message": "The request body failed schema validation.",
            "details": errors,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Sanitized HTTP exception handler."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, str) else "Request Error",
            "status_code": exc.status_code,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all error handler ensuring no internal stack traces or secrets leak."""
    logger.error("Unhandled internal error processing %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred while processing the request.",
        },
    )


# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def get_health() -> HealthResponse:
    """Return Ollama connectivity, model status, and fallback mode."""
    return await service.get_health()


@app.post("/api/intervene", response_model=InterventionDecision, tags=["Intervention"])
async def evaluate_intervention(event: AttentionEvent) -> InterventionDecision:
    """Evaluate attention telemetry and determine intervention level."""
    return await service.evaluate_intervention(event)


@app.post("/api/decompose", response_model=TaskDecompositionResponse, tags=["Task Breakdown"])
async def decompose_task(request: TaskDecompositionRequest) -> TaskDecompositionResponse:
    """Decompose an overwhelming goal into sequential subtasks."""
    # Extra bounds check on task length
    if len(request.taskDescription) > settings.max_task_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"taskDescription exceeds maximum allowed length of {settings.max_task_length} characters.",
        )
    return await service.decompose_task(request)


@app.post("/api/recover", response_model=RecoveryFeedbackResponse, tags=["Focus Recovery"])
async def recover_feedback(request: RecoveryFeedbackRequest) -> RecoveryFeedbackResponse:
    """Process focus drift feedback and provide supportive coaching."""
    return await service.recover_feedback(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=settings.assistant_host,
        port=settings.assistant_port,
        reload=False,
    )
