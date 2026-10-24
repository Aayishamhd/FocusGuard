"""
assistant/tests/test_behavioral.py

Behavioral verification test suite for FocusGuard Attention Agent:
1. Productive context switching (IDE -> Terminal -> Docs) does NOT trigger recovery suggestions
2. Low-confidence signals (<0.50) conservatively suppress interventions
3. Transient lookups (<30s) in documentation/utility tools are ignored
4. Work apps with sustained hesitation trigger helpful micro-step assistance (Level 3)
5. Deterministic bounds guard against hallucinated LLM decisions (e.g. break suggestions in early sessions)
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from src.llm.fallback_heuristics import decide_intervention
from src.models.contracts import (
    ActiveApp,
    AttentionEvent,
    AttentionMetrics,
    AttentionState,
    InterventionDecision,
    InterventionLevel,
)
from src.services.assistant_service import assistant_service


def build_event(
    state: AttentionState,
    *,
    confidence: float = 0.85,
    category: str = "work",
    app: str = "Code",
    title: str = "editor.py",
    switch_count: int = 1,
    app_duration: float = 120,
    session_duration: float = 1800,
    inactivity: float = 0,
) -> AttentionEvent:
    return AttentionEvent(
        eventId="ae-beh-001",
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
        ),
        sources=["window_tracker", "activity_monitor"],
    )


class TestAttentionAgentBehavior:
    def test_productive_context_switching_no_false_positive(self):
        """
        Scenario A: User switches 5 times between IDE, Terminal, and Docs.
        The system must NOT trigger LEVEL_2_RECOVERY_SUGGESTION.
        """
        event = build_event(
            AttentionState.POSSIBLY_DRIFTING,
            category="work",
            app="Visual Studio Code",
            title="FocusGuard - server.py",
            switch_count=5,
            app_duration=60,
        )
        decision = decide_intervention(event)
        # Must not push user to 'recover' from their work tools
        assert decision.level != InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION
        assert decision.shouldIntervene is False

    def test_low_confidence_ambiguous_signal_suppression(self):
        """
        Scenario C: Sensor signals are noisy or ambiguous (confidence = 0.30).
        Attention Agent must behave conservatively and suppress intervention.
        """
        event = build_event(
            AttentionState.POSSIBLY_DRIFTING,
            confidence=0.30,
            category="entertainment",
            app="YouTube",
            switch_count=6,
        )
        decision = decide_intervention(event)
        assert decision.shouldIntervene is False
        assert decision.level == InterventionLevel.LEVEL_0_NONE
        assert "Confidence too low" in decision.triggerReason

    def test_transient_lookup_in_docs_ignored(self):
        """
        User quickly opens documentation for 15 seconds.
        Should not interrupt the developer.
        """
        event = build_event(
            AttentionState.POSSIBLY_DRIFTING,
            category="work",
            app="Chrome",
            title="Python documentation",
            switch_count=3,
            app_duration=15,  # 15 seconds
        )
        decision = decide_intervention(event)
        assert decision.shouldIntervene is False
        assert decision.level == InterventionLevel.LEVEL_0_NONE

    def test_distracted_on_work_app_triggers_assistance(self):
        """
        If user is in IDE/work tool but marked DISTRACTED (hesitation/stuck),
        offer Level 3 Assistance (task decomposition) rather than Level 2 leisure recovery.
        """
        event = build_event(
            AttentionState.DISTRACTED,
            category="work",
            app="Visual Studio Code",
            title="ComplexAlgo.py",
            switch_count=4,
            app_duration=300,
        )
        decision = decide_intervention(event)
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_3_ASSISTANCE
        assert any(a.actionId == "break_down_task" for a in (decision.actions or []))

    def test_distracted_on_entertainment_triggers_recovery(self):
        """
        Scenario B: Sustained leisure app (YouTube/Reddit) triggers Level 2 recovery.
        """
        event = build_event(
            AttentionState.DISTRACTED,
            category="entertainment",
            app="YouTube",
            title="Cat Videos",
            switch_count=6,
            app_duration=360,
        )
        decision = decide_intervention(event)
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION

    @pytest.mark.asyncio
    async def test_llm_break_suggestion_sanity_cap(self):
        """
        If LLM hallucinates LEVEL_4_BREAK_SUGGESTION during a 5-minute session,
        deterministic bounds downgrade it to LEVEL_1.
        """
        event = build_event(
            AttentionState.POSSIBLY_DRIFTING,
            session_duration=300,  # 5 minutes
            confidence=0.85,
        )
        hallucinated_decision = InterventionDecision(
            decisionId="dec-hal-1",
            timestamp="2026-10-24T12:00:00.000Z",
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_4_BREAK_SUGGESTION,
            triggerReason="Take a 15-minute break now",
            message="You should take a break!",
            suggestedBreakMinutes=15,
        )

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value=hallucinated_decision.model_dump_json())):
                result = await assistant_service.intervene(event)
                assert result.level == InterventionLevel.LEVEL_1_GENTLE_REMINDER
                assert result.suggestedBreakMinutes is None

    @pytest.mark.asyncio
    async def test_llm_low_confidence_veto(self):
        """
        Even if LLM claims shouldIntervene=True, low event confidence overrides it.
        """
        event = build_event(
            AttentionState.DISTRACTED,
            confidence=0.20,
        )
        llm_decision = InterventionDecision(
            decisionId="dec-hal-2",
            timestamp="2026-10-24T12:00:00.000Z",
            shouldIntervene=True,
            level=InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION,
            triggerReason="User is distracted",
            message="Back to work!",
        )

        with patch("src.llm.ollama_client.OllamaClient.is_available", AsyncMock(return_value=True)):
            with patch("src.llm.ollama_client.OllamaClient.generate", AsyncMock(return_value=llm_decision.model_dump_json())):
                result = await assistant_service.intervene(event)
                assert result.shouldIntervene is False
                assert result.level == InterventionLevel.LEVEL_0_NONE
