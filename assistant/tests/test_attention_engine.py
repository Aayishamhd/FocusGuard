"""
assistant/tests/test_attention_engine.py

Comprehensive tests for Stage 2 Attention State Engine & Context Analyzer:
1. Focused (stable activity, productive switching)
2. Possible drift (moderate switching, uncertain context)
3. Distracted (repeated unrelated activity, high switching with unrelated context)
4. Recovering (return to previous task after drift/distraction)
5. Edge cases (no current task, empty history, missing signals, conflicting signals, webcam unavailable)
"""

from __future__ import annotations

import pytest

from src.attention.context_analyzer import ContextAnalyzer
from src.attention.reason_codes import AttentionReasonCode
from src.attention.state_engine import AttentionStateEngine
from src.models.contracts import (
    ActiveApp,
    AttentionEvent,
    AttentionMetrics,
    AttentionState,
)


def create_event(
    app: str = "VS Code",
    title: str = "main.py - project",
    category: str = "work",
    switch_count: int = 0,
    app_duration: float = 300,
    session_duration: float = 1200,
    inactivity: float = 0,
    webcam_engaged: bool | None = None,
    sources: list[str] | None = None,
    state: AttentionState = AttentionState.FOCUSED,
    confidence: float = 0.85,
) -> AttentionEvent:
    if sources is None:
        sources = ["window_tracker", "activity_monitor"]
    return AttentionEvent(
        eventId="ae-test-eng",
        timestamp="2026-10-24T12:00:00.000Z",
        attentionState=state,
        confidence=confidence,
        activeApp=ActiveApp(
            appName=app,
            windowTitle=title,
            category=category,  # type: ignore[arg-type]
        ),
        metrics=AttentionMetrics(
            sessionDurationSeconds=session_duration,
            appDurationSeconds=app_duration,
            recentSwitchCount=switch_count,
            inactivitySeconds=inactivity,
            webcamEngaged=webcam_engaged,
        ),
        sources=sources,  # type: ignore[arg-type]
    )


class TestAttentionStateEngineFocused:
    def test_stable_activity_focused(self):
        engine = AttentionStateEngine()
        event = create_event(
            app="Visual Studio Code",
            title="contracts.py - FocusGuard",
            category="work",
            switch_count=0,
            app_duration=900,
        )
        assessment = engine.evaluate(event, current_task="Build FocusGuard state engine")
        assert assessment.state == AttentionState.FOCUSED
        assert assessment.score >= 0.70
        assert assessment.reason_code == AttentionReasonCode.STABLE_TASK_CONTEXT
        assert "contracts" in assessment.explanation.lower() or "visual studio code" in assessment.explanation.lower()

    def test_productive_switching_focused(self):
        """Switching between IDE, Terminal, and Docs is recognized as productive flow."""
        engine = AttentionStateEngine()
        # First event: in IDE
        ev1 = create_event(app="VS Code", title="server.py", category="work", switch_count=1)
        engine.evaluate(ev1, current_task="Build server")

        # Second event: switched to Documentation tab
        ev2 = create_event(
            app="Google Chrome",
            title="FastAPI Documentation - Endpoints",
            category="utility",
            switch_count=3,
            app_duration=45,
        )
        assessment = engine.evaluate(ev2, current_task="Build server")
        assert assessment.state == AttentionState.FOCUSED
        assert assessment.reason_code == AttentionReasonCode.PRODUCTIVE_CONTEXT_SWITCHING
        assert assessment.score >= 0.70


class TestAttentionStateEnginePossibleDrift:
    def test_moderate_switching_drift(self):
        engine = AttentionStateEngine()
        event = create_event(
            app="Finder",
            title="Documents Folder",
            category="utility",
            switch_count=5,
            app_duration=30,
        )
        assessment = engine.evaluate(event, current_task="Code Python algorithms")
        assert assessment.state == AttentionState.POSSIBLY_DRIFTING
        assert assessment.reason_code == AttentionReasonCode.MODERATE_CONTEXT_SWITCHING
        assert 0.40 <= assessment.score < 0.70

    def test_uncertain_context_drift(self):
        engine = AttentionStateEngine()
        event = create_event(
            app="UnknownUtilityApp",
            title="System Preferences / Settings",
            category="unknown",
            switch_count=2,
            app_duration=45,
        )
        assessment = engine.evaluate(event, current_task="Writing presentation slides")
        assert assessment.state == AttentionState.POSSIBLY_DRIFTING
        assert assessment.reason_code == AttentionReasonCode.UNCERTAIN_CONTEXT


class TestAttentionStateEngineDistracted:
    def test_repeated_unrelated_activity(self):
        engine = AttentionStateEngine()
        event = create_event(
            app="Chrome",
            title="YouTube - Trending Funny Clips",
            category="entertainment",
            switch_count=1,
            app_duration=360,
        )
        assessment = engine.evaluate(event, current_task="Develop auth system")
        assert assessment.state == AttentionState.DISTRACTED
        assert assessment.reason_code == AttentionReasonCode.EXTENDED_UNRELATED_ACTIVITY
        assert assessment.score < 0.40

    def test_high_switching_unrelated_context(self):
        engine = AttentionStateEngine()
        event = create_event(
            app="Chrome",
            title="Reddit - r/gaming feed",
            category="entertainment",
            switch_count=7,
            app_duration=120,
        )
        assessment = engine.evaluate(event, current_task="Refactor test suite")
        assert assessment.state == AttentionState.DISTRACTED
        assert assessment.reason_code == AttentionReasonCode.HIGH_SWITCHING_UNRELATED_CONTEXT
        assert assessment.score < 0.40


class TestAttentionStateEngineRecovering:
    def test_return_to_previous_task(self):
        engine = AttentionStateEngine()

        # Step 1: User was distracted on YouTube
        ev_distracted = create_event(
            app="Chrome",
            title="YouTube - Cat Videos",
            category="entertainment",
            switch_count=5,
        )
        engine.evaluate(ev_distracted, current_task="Write backend API")

        # Step 2: User switches back to IDE
        ev_return = create_event(
            app="VS Code",
            title="api.py - Write backend API",
            category="work",
            switch_count=6,
            app_duration=25,
        )
        assessment = engine.evaluate(ev_return, current_task="Write backend API")
        assert assessment.state == AttentionState.RECOVERING
        assert assessment.reason_code == AttentionReasonCode.RETURN_TO_PREVIOUS_TASK


class TestAttentionStateEngineEdgeCases:
    def test_no_current_task(self):
        """Engine functions gracefully without a defined current task."""
        engine = AttentionStateEngine()
        event = create_event(
            app="VS Code",
            title="main.py",
            category="work",
            switch_count=0,
        )
        assessment = engine.evaluate(event, current_task=None)
        assert assessment.state == AttentionState.FOCUSED
        assert assessment.score >= 0.70

    def test_empty_history(self):
        """First event evaluated with zero prior history."""
        engine = AttentionStateEngine()
        assert len(engine.history) == 0
        event = create_event()
        assessment = engine.evaluate(event)
        assert assessment is not None
        assert len(engine.history) == 1

    def test_missing_activity_monitor_signal(self):
        """Only window_tracker present — confidence reflects lower signal coverage."""
        engine = AttentionStateEngine()
        event = create_event(sources=["window_tracker"])
        assessment = engine.evaluate(event)
        # Without activity monitor, confidence is lower than multi-sensor
        assert assessment.confidence <= 0.65

    def test_conflicting_signals(self):
        """Webcam claims engaged, but active app is entertainment — confidence is penalized."""
        engine = AttentionStateEngine()
        event = create_event(
            app="Chrome",
            title="YouTube Shorts",
            category="entertainment",
            webcam_engaged=True,
            sources=["window_tracker", "activity_monitor", "webcam_headpose"],
        )
        assessment = engine.evaluate(event)
        assert assessment.confidence < 0.75

    def test_webcam_unavailable(self):
        """When webcam is not in sources, engine calculates score without errors."""
        engine = AttentionStateEngine()
        event = create_event(
            webcam_engaged=None,
            sources=["window_tracker", "activity_monitor"],
        )
        assessment = engine.evaluate(event)
        assert assessment.signal_breakdown["webcam_score"] == -1.0
        assert assessment.score >= 0.0

    def test_long_inactivity_triggers_idle(self):
        engine = AttentionStateEngine()
        event = create_event(inactivity=350)
        assessment = engine.evaluate(event)
        assert assessment.state == AttentionState.IDLE
        assert assessment.reason_code == AttentionReasonCode.LONG_INACTIVITY
