# FocusGuard AI Assistant & Human-Centered Intervention (`assistant/`)

Welcome to the **FocusGuard AI Assistant** service (Feature 2), an empathetic, privacy-first companion designed to help knowledge workers recover and protect their focus without shame or guilt.

---

## 1. Architecture Overview

FocusGuard AI Assistant operates as an isolated, asynchronous Python HTTP service running on `http://127.0.0.1:5002`. It coordinates local LLM reasoning (via Ollama) with a deterministic heuristic fallback engine, guaranteeing zero downtime and complete contract compatibility even when Ollama is offline.

```text
assistant/
├── src/
│   ├── config.py                 # Safe environment-driven configuration
│   ├── models.py                 # Pydantic schemas strictly matching docs/SHARED_CONTRACTS.md
│   ├── server.py                 # FastAPI service bound to 127.0.0.1:5002
│   ├── llm/
│   │   ├── ollama_client.py       # Asynchronous HTTP client with timeout & bounded retry
│   │   └── fallback_heuristics.py # Deterministic offline rules (Intervention, Decompose, Recover)
│   ├── prompts/
│   │   ├── intervention.py        # Human-centered decision prompts
│   │   ├── task_decomposition.py  # Untrusted user data isolation & decomposition prompts
│   │   └── recovery.py            # Supportive recovery coaching prompts
│   ├── guardrails/
│   │   ├── output_validator.py    # Robust JSON parsing, schema enforcement & normalization
│   │   └── safety_filter.py       # Filters shaming words, diagnoses, and prompt injections
│   └── services/
│       └── assistant_service.py   # Core coordinator between Ollama and offline fallbacks
├── mocks/
│   ├── sample_events.json         # Representative synthetic AttentionEvent scenarios
│   ├── replay_events.py           # CLI event replay harness
│   └── test_ollama_prompts.py     # Prompt verification CLI for task decomposition
├── tests/
│   ├── test_api.py                # Automated tests for all 4 HTTP endpoints
│   ├── test_fallback.py           # Comprehensive offline heuristic test suite
│   ├── test_guardrails.py         # JSON extraction and AI safety guardrail tests
│   ├── test_ollama_client.py      # Mocked network and timeout resilience tests
│   └── test_prompts.py            # Prompt structure and injection defense tests
├── requirements.txt               # Pinned Python dependencies
└── README.md                      # Setup, commands, and operational documentation
```

---

## 2. Shared Contract Endpoints

The service strictly implements the frozen specifications defined in [`docs/SHARED_CONTRACTS.md`](../docs/SHARED_CONTRACTS.md):

| Method | Endpoint | Description | Request Model | Response Model |
|---|---|---|---|---|
| `GET` | `/health` | Health & LLM connectivity status | *(None)* | `HealthResponse` |
| `POST` | `/api/intervene` | Evaluates attention telemetry | `AttentionEvent` | `InterventionDecision` |
| `POST` | `/api/decompose` | Breaks tasks into bite-sized steps | `TaskDecompositionRequest` | `TaskDecompositionResponse` |
| `POST` | `/api/recover` | Supportive focus recovery coaching | `RecoveryFeedbackRequest` | `RecoveryFeedbackResponse` |

---

## 3. Quick Start (Windows PowerShell)

### Step 1: Create and Activate Virtual Environment
From the repository root:
```powershell
python -m venv assistant\.venv
.\assistant\.venv\Scripts\Activate.ps1
```

*(On macOS / Linux)*:
```bash
python3 -m venv assistant/.venv
source assistant/.venv/bin/activate
```

### Step 2: Install Dependencies
```powershell
pip install -r assistant\requirements.txt
```

### Step 3: (Optional) Configure Ollama
Ollama is completely optional. If installed and running on `http://127.0.0.1:11434`, pull the default model:
```powershell
ollama pull llama3.2
```

To configure an alternative model or host:
```powershell
$env:OLLAMA_MODEL = "mistral"
$env:OLLAMA_HOST = "http://127.0.0.1:11434"
```

### Step 4: Start the Service
From the repository root:
```powershell
python -m uvicorn src.server:app --app-dir assistant --host 127.0.0.1 --port 5002
```

The service will bind exclusively to loopback (`127.0.0.1:5002`).

---

## 4. Verification & Testing

### 1. Check Health
```powershell
curl http://127.0.0.1:5002/health
```
Example Output:
```json
{
  "status": "ok",
  "llmConnected": false,
  "model": "llama3.2",
  "fallbackMode": true
}
```

### 2. Test Intervention Endpoint (`/api/intervene`)
```powershell
curl -X POST http://127.0.0.1:5002/api/intervene `
  -H "Content-Type: application/json" `
  -d '{
    "eventId": "ae-test-01",
    "timestamp": "2026-10-24T22:00:00.000Z",
    "attentionState": "DISTRACTED",
    "confidence": 0.90,
    "activeApp": {
      "appName": "YouTube",
      "windowTitle": "Watch Video",
      "category": "entertainment"
    },
    "metrics": {
      "sessionDurationSeconds": 2400,
      "appDurationSeconds": 300,
      "recentSwitchCount": 6,
      "inactivitySeconds": 20
    },
    "sources": ["window_tracker"]
  }'
```

### 3. Test Task Decomposition (`/api/decompose`)
```powershell
curl -X POST http://127.0.0.1:5002/api/decompose `
  -H "Content-Type: application/json" `
  -d '{"taskDescription": "Prepare project slides and write unit tests"}'
```

### 4. Test Recovery Coaching (`/api/recover`)
```powershell
curl -X POST http://127.0.0.1:5002/api/recover `
  -H "Content-Type: application/json" `
  -d '{"sessionId": "s-1", "currentTask": "Coding", "userReason": "tired"}'
```

---

## 5. Event Replay and Prompt CLI Tools

FocusGuard provides standalone simulation tools inside `assistant/mocks/` for local development without running the engine or desktop client:

### Replay Synthetic Scenarios
Replay representative scenarios (`stable-work`, `productive-research`, `heavy-distraction`, `prolonged-focus`, `missing-context`, `all`):
```powershell
# Replay heavy distraction
python assistant\mocks\replay_events.py --scenario heavy-distraction

# Replay all scenarios
python assistant\mocks\replay_events.py --scenario all
```

### Prompt & Decomposition Test
Decompose any arbitrary goal and verify immediate-next-step extraction:
```powershell
python assistant\mocks\test_ollama_prompts.py --task "Prepare presentation"
```

---

## 6. Running the Automated Test Suite

Run the full pytest suite (54 unit, integration, and guardrail tests):
```powershell
assistant\.venv\Scripts\pytest assistant\tests -v
```

All tests execute completely offline without requiring Ollama or network access.

---

## 7. Human-Centered Principles & AI Safety Guardrails

FocusGuard strictly adheres to the **AI for Humanity** ethos:

1. **Zero Shaming**: The AI never blames or scolds the user. Language implying moral failure ("lazy", "wasting time", "slacking") is proactively filtered and replaced with supportive check-ins.
2. **No Diagnostic Claims**: The AI will never issue pseudo-medical diagnoses (e.g. ADHD, depression, anxiety disorders).
3. **Agency & Consent**: Users always have dismiss buttons and control over their time. Interventions suggest breaks or step breakdowns rather than forcing work.
4. **Data Privacy & Loopback Trust**: The service binds strictly to `127.0.0.1`. No telemetry or user input is transmitted to any cloud API or external service.
5. **Untrusted Input Protection**: User-submitted task goals are strictly isolated from prompt instructions to defend against prompt injection attempts.
