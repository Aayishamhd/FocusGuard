# FocusGuard — Feature 2: AI Assistant & Human-Centered Intervention Service

> **Port**: `5002` (configurable via `.env` / `ASSISTANT_PORT`)  
> **Branch**: `feat/ai-assistant`  
> **Contract**: [`docs/SHARED_CONTRACTS.md`](../docs/SHARED_CONTRACTS.md) (v1.0.0 FROZEN)  
> **Sandbox**: `assistant/**` ONLY  

---

## 📖 Overview

The AI Assistant is the reasoning and intervention engine for FocusGuard. It operates between raw activity/attention signals (from Feature 1) and user-facing notifications/coaching (Feature 3 Desktop).

### Architecture Pipeline
```text
AttentionEvent (from F1 / Desktop)
      ↓
Context Analysis & Attention State Evaluation
      ↓
Ollama Local LLM (with async httpx)
      ↓ (fallback on offline/timeout/malformed output)
Rule-based Heuristic Fallback Engine
      ↓
Safety Filter & Schema Guardrails
      ↓
InterventionDecision (JSON returned to F3 Desktop)
```

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.11+
- Dependencies in `requirements.txt`

### 2. Installation
```powershell
# From the repository root or assistant directory:
pip install -r assistant/requirements.txt
```

### 3. Configuration
Copy `.env.example` to `.env` (optional; sensible defaults are built in):
```powershell
cp assistant/.env.example assistant/.env
```

Key environment variables:
- `ASSISTANT_PORT`: Port to listen on (default: `5002`)
- `OLLAMA_URL`: Local Ollama API URL (default: `http://127.0.0.1:11434`)
- `OLLAMA_MODEL`: Target model (default: `llama3.2`)
- `OLLAMA_TIMEOUT_SECONDS`: Request timeout in seconds before triggering fallback (default: `5.0`)
- `FORCE_FALLBACK`: Set to `true` to force heuristic fallback engine (default: `false`)

### 4. Running the Service
```powershell
python -m uvicorn assistant.src.server:app --port 5002 --reload
```
Interactive API docs are available at [http://127.0.0.1:5002/docs](http://127.0.0.1:5002/docs).

---

## 🧪 Testing

### Running the Pytest Suite
```powershell
python -m pytest assistant/tests -v
```

### Mock Replay Harness (Test against live server)
While the server is running on port 5002, you can replay mock events:
```powershell
# Replay specific scenario
python assistant/mocks/replay_events.py --scenario distracted

# Replay all scenarios
python assistant/mocks/replay_events.py --scenario all

# Test task decomposition
python assistant/mocks/replay_events.py --decompose "Finish writing the project report"

# Test recovery guidance
python assistant/mocks/replay_events.py --recover "mental_fatigue"
```

---

## 📡 API Endpoints (SHARED_CONTRACTS v1.0.0)

| Method | Route | Description | Input | Output |
|---|---|---|---|---|
| `GET` | `/health` | Service health & LLM status | None | `HealthResponse` |
| `POST` | `/api/intervene` | Attention evaluation & intervention | `AttentionEvent` | `InterventionDecision` |
| `POST` | `/api/decompose` | Micro-step task breakdown | `TaskDecompositionRequest` | `TaskDecompositionResponse` |
| `POST` | `/api/recover` | Supportive distraction recovery | `RecoveryFeedbackRequest` | `RecoveryFeedbackResponse` |

---

## 🛡️ Fallback Guarantees
- The service **never returns 500 Internal Server Error** for domain logic failures.
- If Ollama is unreachable, times out (>5s), or generates malformed output, the rule-based heuristic engine instantly provides safe, compassionate, contract-compliant responses.
