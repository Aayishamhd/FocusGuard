# FocusGuard — Feature 2: AI Assistant & Human-Centered Intervention

## 1. Ownership & Parallel Development Sandbox

> **Branch Name**: `feat/ai-assistant`  
> **Dedicated Directory**: `/assistant` (All code, prompts, tests, and dependencies **must** reside here)  
> **Service Port**: `http://127.0.0.1:5002`  
> **Shared Contract**: Reference [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md) for request/response schemas.

### ⚠️ Strict Sandbox Directive for AI Agents and Developers
- **ALLOWED**: Create, modify, and delete files inside `/assistant/**` ONLY.
- **FORBIDDEN**:
  - Do NOT touch `/engine/**` or `/desktop/**`.
  - Do NOT modify root configuration files (`package.json`, `.gitignore`, `README.md`) without team consensus.
  - Do NOT directly manipulate Electron UI code or native window hooks.
- **Dependencies**: Keep all dependencies isolated inside `/assistant/requirements.txt` (Python) or `/assistant/package.json` (Node.js).

---

## 2. Mission & Responsibilities

Build the local AI reasoning service that converts raw attention events into gentle, actionable, and human-centered support.

### In Scope (Your Responsibilities)
- Ollama / local LLM integration (default: `llama3.2`, `mistral`, or `phi3`).
- Context-aware intervention decider (determining whether intervention is warranted).
- Task decomposition engine (breaking large goals into actionable, bite-sized steps).
- Smallest immediate next-step generation.
- Focus recovery coaching (supportive guidance when focus drifts).
- AI safety guardrails, schema enforcement, and JSON validation.
- Offline heuristic fallback (ensures the service works even if Ollama is not installed).
- Exposing a local HTTP REST service on port `5002`.
- Providing an offline event-replay harness so you can test prompts without running the engine.

### Out of Scope (Owned by Other Branches)
- Active window tracking, mouse/keyboard listeners, and MediaPipe webcam processing (Feature 1).
- Electron UI components, notifications, modals, and tray controls (Feature 3).
- SQLite session storage and persistent UI analytics (Feature 3).

---

## 3. Intervention Levels & Philosophy

FocusGuard is built to **help users recover focus**, never to punish or shame them.

| Level | Name | Typical Trigger | User-Facing Example |
|---|---|---|---|
| **Level 0** | NO_INTERVENTION | Stable work, brief productive lookup | *(Silent)* |
| **Level 1** | GENTLE_REMINDER | Slight drift, 2+ min idle on browser | "Looks like your attention may have shifted." |
| **Level 2** | RECOVERY_SUGGESTION | Sustained leisure app switching | "Want to return to your coding task?" |
| **Level 3** | ASSISTANCE | Prolonged hesitation / stuck state | "This task seems heavy. Want to break it into 3 small steps?" |
| **Level 4** | BREAK_SUGGESTION | > 90 min continuous high focus or fatigue | "You've been in deep focus for 90 minutes. Would a 5-minute break recharge you?" |

---

## 4. Frozen Service API Endpoints (`http://127.0.0.1:5002`)

Feature 2 exposes standard HTTP endpoints matching [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md):

### 4.1 `GET /health`
Returns LLM connectivity status and loaded model:
```json
{
  "status": "ok",
  "llmConnected": true,
  "model": "llama3.2",
  "fallbackMode": false
}
```

### 4.2 `POST /api/intervene`
Evaluates an incoming `AttentionEvent` and returns whether and how to nudge the user:
- **Request Body**: `AttentionEvent` (from Feature 1 / Desktop)
- **Response**: `InterventionDecision`
```json
{
  "decisionId": "dec-1092-b4",
  "timestamp": "2026-10-24T21:55:00.000Z",
  "shouldIntervene": true,
  "level": "LEVEL_2_RECOVERY_SUGGESTION",
  "triggerReason": "User switched to YouTube for 4 minutes during focus session",
  "message": "Focus drifted over to YouTube. Ready to jump back to writing your presentation?",
  "actions": [
    { "actionId": "return_to_task", "label": "Back to Presentation" },
    { "actionId": "break_down_task", "label": "Break into Smaller Steps" },
    { "actionId": "take_break", "label": "Take a 5-min Break" },
    { "actionId": "dismiss", "label": "Still Working" }
  ]
}
```

### 4.3 `POST /api/decompose`
Decomposes an intimidating or vague task:
- **Request Body**: `TaskDecompositionRequest` (`{ "taskDescription": "Complete final project report" }`)
- **Response**: `TaskDecompositionResponse`
```json
{
  "originalTask": "Complete final project report",
  "subtasks": [
    {
      "stepNumber": 1,
      "title": "Open document and write introduction",
      "description": "Outline the 3 main goals in 2 paragraphs.",
      "estimatedMinutes": 10,
      "isImmediateNextStep": true
    },
    {
      "stepNumber": 2,
      "title": "Compile data graphs",
      "description": "Insert performance charts from test results.",
      "estimatedMinutes": 15,
      "isImmediateNextStep": false
    }
  ]
}
```

### 4.4 `POST /api/recover`
Processes user feedback after attention drift:
- **Request Body**: `RecoveryFeedbackRequest` (`{ "userReason": "tired" | "task_confusing" | "distracted" | "need_break" }`)
- **Response**: `RecoveryFeedbackResponse`

---

## 5. Offline & Heuristic Fallback (Zero-Block Guarantee)

To guarantee that Feature 3 teammates can run end-to-end flows even if Ollama is not installed or the local LLM takes too long to load:
1. Check `http://127.0.0.1:11434/api/tags` on startup.
2. If Ollama is unreachable or times out (> 3 seconds), switch to **Heuristic Rule Engine**.
3. Fallback uses template rules:
   - Distracted -> returns Level 2 nudge with task resume prompt.
   - Task decompose -> splits tasks by conjunctions or standard 4-step template.
   - Recovery "tired" -> recommends 5-min break.
4. **Never return a 500 error** to the Desktop UI; always deliver a graceful response adhering to the contract.

---

## 6. Prompt Engineering & AI Safety Guardrails

### Core Safety Rules
1. **No Psychological/Medical Diagnoses**: Never say "You are depressed/ADHD/anxious". Use factual observations: "Your active window shifted".
2. **No User Shaming**: Replace "You are wasting time" with "Would you like help returning to your goal?".
3. **Strict JSON Schema Enforcement**: Always prompt Ollama with a strict JSON format instruction and parse with fallback regex to strip markdown code fences.

---

## 7. Parallel Test Harness

Feature 2 includes a replay script in `assistant/mocks/replay_events` so you can develop without Feature 1 running:

```bash
# Replay synthetic events to test intervention logic
python assistant/mocks/replay_events.py --scenario heavy-distraction
python assistant/mocks/test_ollama_prompts.py --task "Prepare presentation"
```

---

## 8. Directory Structure for `/assistant`

```text
assistant/
├── src/
│   ├── llm/
│   │   ├── ollama_client.py       # Local Ollama HTTP client with timeout & retry
│   │   └── fallback_heuristics.py # Offline rule-based fallbacks
│   ├── prompts/
│   │   ├── task_decomposition.py  # Prompt template & output schema
│   │   ├── intervention.py        # Decision logic prompt
│   │   └── recovery.py            # Recovery guidance prompt
│   ├── guardrails/
│   │   ├── output_validator.py    # Schema validation & JSON parser
│   │   └── safety_filter.py       # Strips shaming or diagnostic language
│   ├── services/
│   │   └── assistant_service.py   # Core coordinator
│   └── server.py                  # Local HTTP server (Port 5002)
├── mocks/
│   ├── sample_events.json         # Replay data from Feature 1
│   └── replay_events.py           # Test runner feeding sample events
├── tests/
│   ├── test_prompts.py            # Unit tests for prompt generation
│   ├── test_fallback.py           # Unit tests for offline heuristics
│   └── test_guardrails.py         # Ensure unsafe model outputs are caught
├── requirements.txt / package.json
└── README.md                      # Instructions on Ollama setup and testing
```

---

## 9. Pre-Merge Checklist for `feat/ai-assistant`

- [ ] All code and prompts are isolated strictly inside `/assistant`.
- [ ] No files in `/engine`, `/desktop`, or root files were edited.
- [ ] Service starts cleanly on port `5002` and handles all endpoints.
- [ ] Heuristic fallback works when Ollama is offline.
- [ ] All responses conform to schemas in `SHARED_CONTRACTS.md`.
- [ ] `git status` shows changes ONLY under `assistant/`.
