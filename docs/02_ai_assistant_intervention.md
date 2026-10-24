# FocusGuard — Feature 2: AI Assistant & Human-Centered Intervention

## Antigravity Prompt

You own **Feature 2: AI Assistant & Human-Centered Intervention**.

Build the AI reasoning layer that converts attention/context signals into useful, gentle assistance.

### Own these features

- Ollama/local LLM integration
- Task decomposition
- First-step assistance
- Context-aware intervention decisions
- Intervention levels
- Focus recovery
- Break suggestions
- User feedback handling
- Personalization of intervention style
- Prompt/system architecture
- AI guardrails
- Model-output validation

### Core principle

FocusGuard helps people **recover focus**, not punish distraction.

The AI should:

- Understand, not judge
- Assist, not control
- Support, not constantly interrupt
- Personalize, not prescribe
- Protect, not unnecessarily collect

### Intervention levels

```text
LEVEL 0 — NO INTERVENTION
LEVEL 1 — GENTLE REMINDER
LEVEL 2 — RECOVERY SUGGESTION
LEVEL 3 — ASSISTANCE
LEVEL 4 — BREAK SUGGESTION
```

Examples:

```text
Level 1:
"Looks like your focus may have drifted."

Level 2:
"Want to return to the task you were working on?"

Level 3:
"This task seems difficult to get started with. Want me to break it into smaller steps?"

Level 4:
"You've been working for a while. Would a short break help?"
```

Do not interrupt simply because an attention event arrived. The AI must decide whether intervention is useful.

### Task decomposition

Input:

> Build the project presentation.

Output should be actionable:

```text
1. Define the problem
2. Explain the solution
3. Create the architecture
4. Explain the AI pipeline
5. Prepare the demo
6. Add results
7. Practice the presentation
```

Also support a smallest useful next action.

### Focus Recovery Mode

Support:

```text
Focus seems to have drifted. No worries.

What happened?

[I'm tired]
[The task is confusing]
[I got distracted]
[I need a break]
[Something else]
```

Examples:

- Confusing → simplify/decompose the task.
- Tired → suggest a short break.
- Distracted → help return to the previous task.
- Need a break → enter break mode.

Never assume why the user was distracted.

### Prompt architecture

Do not use one giant prompt.

Create separate structured prompts/system instructions for:

1. Task decomposition
2. First-step generation
3. Intervention decision
4. Recovery assistance
5. Personalized recommendations
6. Focus insight generation

Prefer structured model outputs and validate them before the UI receives them.

### AI safety

Never make unsupported claims such as:

> "You're distracted because you're anxious."

Prefer:

> "Your activity suggests your attention may have shifted. I can't know why. Would you like to tell me?"

Do not diagnose or make medical/psychological claims.

Do not shame the user.

Do not fabricate observations that were not provided by the context engine.

### Personalization

Support styles such as:

```text
Gentle
Minimal
Motivational
Silent
More frequent
Only when necessary
```

Use feedback such as accepted/dismissed interventions, requests for help, breaks, and successful recovery to adjust future assistance.

### Integration contract

Consume Feature 1 events and produce structured actions for Feature 3.

Example:

```json
{
  "action": "RECOVERY_SUGGESTION",
  "message": "Want to return to your last task?",
  "reason": "sustained_attention_drift",
  "priority": "low"
}
```

Do not directly manipulate Electron UI components.

### Acceptance criteria

1. Ollama/local LLM works through a clean service layer.
2. Large tasks can be decomposed.
3. A smallest useful next action can be generated.
4. Attention events can trigger intervention decisions.
5. The system can choose not to intervene.
6. Recovery reasons produce different assistance.
7. Break suggestions work.
8. User feedback can influence future intervention behavior.
9. Invalid/unsafe model output is handled.
10. Prompts and guardrails are documented.
11. Main demo uses real AI, not hardcoded AI responses.

### Antigravity instruction

Inspect the repository and Feature 1 event contract before coding.

Do not duplicate attention detection logic.

Do not build the dashboard.

Focus on the AI/service layer and expose stable interfaces for Electron.

Prioritize reliable end-to-end flows over experimental features.
