# FocusGuard 🛡️

> **AI-Powered Focus Companion with Gentle, Human-Centered Attention Recovery**

FocusGuard is a desktop application designed to sense attention shifts, help users overcome cognitive friction, and gently guide them back to their flow state without punitive tracking or shaming.

---

## 🏗️ System Architecture & Parallel Development

FocusGuard is divided into three isolated, independently runnable subsystems communicating through typed contracts:

```text
┌─────────────────────────────────┐
│ Feature 1: Attention Engine     │  (Port 5001 / SSE)
│ Branch: feat/attention-engine   │  Activity & Active Window Monitoring
│ Directory: /engine              │  Local MediaPipe Gaze (Frames Discarded)
└───────────────┬─────────────────┘
                │ AttentionEvent
                ▼
┌─────────────────────────────────┐
│ Feature 2: AI Assistant         │  (Port 5002 / REST)
│ Branch: feat/ai-assistant       │  Ollama LLM Reasoning & Task Decomposition
│ Directory: /assistant           │  Gentle Interventions & Recovery Logic
└───────────────┬─────────────────┘
                │ InterventionDecision / TaskBreakdown
                ▼
┌─────────────────────────────────┐
│ Feature 3: Desktop UX           │  (Electron App)
│ Branch: feat/desktop-app        │  Main Dashboard, Focus Timer, Overlays
│ Directory: /desktop             │  Local Analytics & Privacy Controls
└─────────────────────────────────┘
```

---

## 👥 Team Directory Ownership Matrix

To prevent git merge conflicts and accidental file overwrites when working across parallel branches, **each feature has an exclusive directory**. Developers and AI agents must confine all code and dependency changes to their assigned folder:

| Subsystem | Git Branch | Working Directory | Documentation |
|---|---|---|---|
| **Feature 1: Attention Engine** | `feat/attention-engine` | `/engine` | [`docs/01_attention_context_engine.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/01_attention_context_engine.md) |
| **Feature 2: AI Assistant** | `feat/ai-assistant` | `/assistant` | [`docs/02_ai_assistant_intervention.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/02_ai_assistant_intervention.md) |
| **Feature 3: Desktop UX** | `feat/desktop-app` | `/desktop` | [`docs/03_desktop_ux_data_analytics.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/03_desktop_ux_data_analytics.md) |
| **Shared Contracts** | `main` | `/docs/SHARED_CONTRACTS.md` | [`docs/SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md) |

---

## ⚡ Zero-Block Parallel Workflow

Teammates **do not need to wait** for other branches to complete before building their own:

1. **Feature 1 (Attention Engine)** provides a **synthetic event generator CLI** (`engine/mocks/generate_synthetic_events.py`) so other branches can test without live OS window tracking.
2. **Feature 2 (AI Assistant)** includes an **offline heuristic fallback** and an event replay harness (`assistant/mocks/replay_events.py`), allowing prompts and logic to be validated without the engine or when Ollama is offline.
3. **Feature 3 (Desktop UX)** includes built-in **`MockEngineClient`** and **`MockAssistantClient`** adapters (`desktop/src/services/`), allowing the complete UI, animations, notifications, and analytics to be run and demonstrated immediately.

---

## 🛡️ Git Parallel Branching Rules (Conflict-Free Guarantee)

1. **Strict Folder Sandbox**: Never add or edit files outside your assigned folder (`/engine`, `/assistant`, or `/desktop`).
2. **Root File Protection**: Do not modify root files or create files at the project root without team agreement.
3. **Independent Dependencies**: Each folder maintains its own isolated package configuration (`engine/requirements.txt`, `assistant/requirements.txt`, `desktop/package.json`).
4. **Pre-Commit Verification**: Run `git status` before committing. If any modified file does not start with your assigned folder prefix, unstage or revert it.
5. **Frozen Contracts**: All inter-service communication conforms to [`docs/SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md).

---

## 🚀 Quick Start for Feature Branches

### Working on Feature 1 (Attention Engine):
```bash
git checkout -b feat/attention-engine
cd engine
pip install -r requirements.txt
python src/server.py
```

### Working on Feature 2 (AI Assistant):
```bash
git checkout -b feat/ai-assistant
cd assistant
pip install -r requirements.txt  # or npm install
python src/server.py
```

### Working on Feature 3 (Desktop UX):
```bash
git checkout -b feat/desktop-app
cd desktop
npm install
npm run dev
```

---

## 📖 Complete Documentation Index

For detailed architectural guidelines and acceptance criteria, consult [`docs/FEATURE_DOCS_INDEX.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/FEATURE_DOCS_INDEX.md).