"""Unit tests for offline heuristic fallback engine."""

from assistant.src.llm.fallback_heuristics import (
    decompose_task_heuristic,
    evaluate_intervention_heuristic,
    generate_smallest_next_step,
    recovery_feedback_heuristic,
)
from assistant.src.models import (
    ActiveApp,
    AppCategory,
    AttentionEvent,
    AttentionMetrics,
    AttentionState,
    InterventionLevel,
    RecoveryRecommendation,
    RecoveryUserReason,
    SourceType,
)


def make_sample_event(
    attention_state: AttentionState = AttentionState.FOCUSED,
    category: AppCategory = AppCategory.WORK,
    app_name: str = "VS Code",
    session_secs: float = 1800,
    switch_count: int = 1,
    inactivity_secs: float = 5,
    confidence: float = 0.9,
) -> AttentionEvent:
    return AttentionEvent(
        eventId="ae-test-01",
        timestamp="2026-10-24T22:00:00.000Z",
        attentionState=attention_state,
        confidence=confidence,
        activeApp=ActiveApp(
            appName=app_name,
            windowTitle="test_project",
            category=category,
        ),
        metrics=AttentionMetrics(
            sessionDurationSeconds=session_secs,
            appDurationSeconds=300,
            recentSwitchCount=switch_count,
            inactivitySeconds=inactivity_secs,
            webcamEngaged=True,
        ),
        sources=[SourceType.WINDOW_TRACKER, SourceType.ACTIVITY_MONITOR],
    )


class TestInterventionHeuristics:
    def test_stable_work_no_intervention(self):
        """Stable work produces LEVEL_0_NONE and shouldIntervene=False."""
        event = make_sample_event(
            attention_state=AttentionState.FOCUSED,
            category=AppCategory.WORK,
            switch_count=1,
            session_secs=1800,
        )
        decision = evaluate_intervention_heuristic(event)
        assert decision.shouldIntervene is False
        assert decision.level == InterventionLevel.LEVEL_0_NONE
        assert decision.message is None

    def test_productive_lookup_no_intervention(self):
        """Brief lookup on utility/work application produces LEVEL_0_NONE."""
        event = make_sample_event(
            attention_state=AttentionState.FOCUSED,
            category=AppCategory.UTILITY,
            app_name="Docs Browser",
            switch_count=2,
            session_secs=900,
        )
        decision = evaluate_intervention_heuristic(event)
        assert decision.shouldIntervene is False
        assert decision.level == InterventionLevel.LEVEL_0_NONE

    def test_sustained_distraction_recovery_suggestion(self):
        """Distraction on entertainment app yields LEVEL_2_RECOVERY_SUGGESTION."""
        event = make_sample_event(
            attention_state=AttentionState.DISTRACTED,
            category=AppCategory.ENTERTAINMENT,
            app_name="YouTube",
            switch_count=6,
            session_secs=2500,
        )
        decision = evaluate_intervention_heuristic(event)
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_2_RECOVERY_SUGGESTION
        assert decision.message is not None
        assert "YouTube" in decision.message
        assert decision.actions is not None
        assert any(a.actionId.value == "return_to_task" for a in decision.actions)

    def test_prolonged_focus_break_suggestion(self):
        """Focus session > 90 minutes (5400s) yields LEVEL_4_BREAK_SUGGESTION."""
        event = make_sample_event(
            attention_state=AttentionState.FOCUSED,
            category=AppCategory.WORK,
            session_secs=5500,  # > 90 mins
        )
        decision = evaluate_intervention_heuristic(event)
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_4_BREAK_SUGGESTION
        assert decision.suggestedBreakMinutes == 5
        assert any(a.actionId.value == "take_break" for a in decision.actions)

    def test_stuck_state_assistance(self):
        """High switches inside work application triggers LEVEL_3_ASSISTANCE."""
        event = make_sample_event(
            attention_state=AttentionState.RECOVERING,
            category=AppCategory.WORK,
            switch_count=5,
            session_secs=1200,
        )
        decision = evaluate_intervention_heuristic(event)
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_3_ASSISTANCE
        assert any(a.actionId.value == "break_down_task" for a in decision.actions)

    def test_idle_drift_gentle_reminder(self):
        """High inactivity with drifting state triggers LEVEL_1_GENTLE_REMINDER."""
        event = make_sample_event(
            attention_state=AttentionState.POSSIBLY_DRIFTING,
            category=AppCategory.UTILITY,
            inactivity_secs=140,
        )
        decision = evaluate_intervention_heuristic(event)
        assert decision.shouldIntervene is True
        assert decision.level == InterventionLevel.LEVEL_1_GENTLE_REMINDER

    def test_missing_or_ambiguous_context_holding(self):
        """Low confidence holds back intervention safely."""
        event = make_sample_event(
            attention_state=AttentionState.IDLE,
            category=AppCategory.UNKNOWN,
            confidence=0.2,
            inactivity_secs=10,
        )
        decision = evaluate_intervention_heuristic(event)
        assert decision.shouldIntervene is False
        assert decision.level == InterventionLevel.LEVEL_0_NONE

    def test_cooldown_active_suppression(self):
        """Cooldown active produces LEVEL_0_NONE with suppression trigger."""
        event = make_sample_event(
            attention_state=AttentionState.DISTRACTED,
            category=AppCategory.ENTERTAINMENT,
        )
        decision = evaluate_intervention_heuristic(event, cooldown_active=True)
        assert decision.shouldIntervene is False
        assert decision.level == InterventionLevel.LEVEL_0_NONE
        assert "cooldown" in decision.triggerReason.lower()


class TestTaskDecompositionHeuristics:
    def test_decompose_template_fallback(self):
        """Task decomposition yields 4 sequential steps with 1 immediate next step."""
        res = decompose_task_heuristic("Write quarterly report")
        assert res.originalTask == "Write quarterly report"
        assert len(res.subtasks) == 4
        assert [st.stepNumber for st in res.subtasks] == [1, 2, 3, 4]

        # Exactly one step marked as immediate next step
        immediate_steps = [st for st in res.subtasks if st.isImmediateNextStep]
        assert len(immediate_steps) == 1
        assert immediate_steps[0].stepNumber == 1
        assert all(st.estimatedMinutes > 0 for st in res.subtasks)

    def test_decompose_conjunction_splitting(self):
        """Splits multi-clause tasks across conjunctions."""
        res = decompose_task_heuristic(
            "Draft project outline and then implement database schema and write unit tests"
        )
        assert len(res.subtasks) >= 2
        assert [st.stepNumber for st in res.subtasks] == list(range(1, len(res.subtasks) + 1))
        immediate_steps = [st for st in res.subtasks if st.isImmediateNextStep]
        assert len(immediate_steps) == 1

    def test_smallest_next_step_helper(self):
        """Helper returns concrete micro-action."""
        action = generate_smallest_next_step("Build dashboard page")
        assert "Build dashboard page" in action
        assert "Open" in action


class TestRecoveryFeedbackHeuristics:
    def test_recovery_tired(self):
        """Reason 'tired' suggests short rest."""
        resp = recovery_feedback_heuristic(RecoveryUserReason.TIRED)
        assert resp.recommendation == RecoveryRecommendation.TAKE_BREAK
        assert resp.actionPayload is not None
        assert resp.actionPayload.suggestedBreakMinutes == 5

    def test_recovery_confusing(self):
        """Reason 'task_confusing' suggests simplifying task."""
        resp = recovery_feedback_heuristic(RecoveryUserReason.TASK_CONFUSING, current_task="Refactor Auth")
        assert resp.recommendation == RecoveryRecommendation.SIMPLIFY_TASK
        assert "Refactor Auth" in (resp.actionPayload.suggestedNextAction or "")

    def test_recovery_distracted(self):
        """Reason 'distracted' offers gentle return without shame."""
        resp = recovery_feedback_heuristic(RecoveryUserReason.DISTRACTED, current_task="Write paper")
        assert resp.recommendation == RecoveryRecommendation.RESUME_PREVIOUS
        assert "distraction" in resp.supportiveMessage.lower() or "drift" in resp.supportiveMessage.lower()
        assert resp.actionPayload is not None

    def test_recovery_need_break(self):
        """Reason 'need_break' supports resting with 10 minutes."""
        resp = recovery_feedback_heuristic(RecoveryUserReason.NEED_BREAK)
        assert resp.recommendation == RecoveryRecommendation.TAKE_BREAK
        assert resp.actionPayload is not None
        assert resp.actionPayload.suggestedBreakMinutes == 10

    def test_recovery_other(self):
        """Reason 'other' provides supportive custom tip."""
        resp = recovery_feedback_heuristic(RecoveryUserReason.OTHER)
        assert resp.recommendation == RecoveryRecommendation.CUSTOM_TIP
        assert resp.actionPayload is not None
