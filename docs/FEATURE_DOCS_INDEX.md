# FocusGuard — Feature Documentation & Parallel Development Guide

This directory contains the feature specifications, architecture boundaries, and inter-service contracts for FocusGuard.

> **CRITICAL ARCHITECTURAL DIRECTIVE FOR ALL DEVELOPERS AND AI AGENTS:**  
> **Strict Sandboxing**: Every feature branch is assigned a single dedicated top-level directory. **Never create, edit, or delete files outside your assigned directory.**  
> Do not touch root configuration files or other teammates' folders without explicit team consensus. This guarantees **zero git merge conflicts** and prevents accidental overwrites when merging parallel branches.

---

## 1. Feature Division & Directory Ownership Matrix

| Feature | Branch Name | Dedicated Directory | Owner / Specialty | Document Spec |
|---|---|---|---|---|
| **Feature 1: Attention & Context Engine** | `feat/attention-engine` | `/engine` | OS Activity Tracking, OpenCV/MediaPipe, Inattention Detection | [`01_attention_context_engine.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/01_attention_context_engine.md) |
| **Feature 2: AI Assistant & Interventions** | `feat/ai-assistant` | `/assistant` | Ollama/LLM Reasoning, Task Decomposition, Recovery Logic, Guardrails | [`02_ai_assistant_intervention.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/02_ai_assistant_intervention.md) |
| **Feature 3: Desktop UX & Analytics** | `feat/desktop-app` | `/desktop` | Electron UI, Session Management, Local SQLite/Store, Analytics Dashboard | [`03_desktop_ux_data_analytics.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/03_desktop_ux_data_analytics.md) |
| **Shared Contracts & Protocol** | `main` | `/docs/SHARED_CONTRACTS.md` | Data Schemas, IPC Protocols, Port Allocations (FROZEN) | [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md) |

---

## 2. Directory Layout & Sandbox Boundaries

```text
FocusGuard/
├── docs/                                   # Project documentation & shared contracts (Read-Only during feature work)
│   ├── FEATURE_DOCS_INDEX.md               # Master index & team collaboration rules (this file)
│   ├── SHARED_CONTRACTS.md                 # Frozen data contracts, ports & mock payloads
│   ├── 01_attention_context_engine.md      # Feature 1 specification
│   ├── 02_ai_assistant_intervention.md     # Feature 2 specification
│   └── 03_desktop_ux_data_analytics.md     # Feature 3 specification
│
├── engine/                                 # 🔒 SANDBOX: Feature 1 (feat/attention-engine) ONLY
│   ├── src/                                # Active window detection, activity metrics, MediaPipe head/gaze
│   ├── tests/                              # Unit tests for state transitions and false-positive filtering
│   ├── mocks/                              # Synthetic event generator CLI for teammates
│   ├── requirements.txt                    # Feature 1 isolated dependencies (Python/Node)
│   └── README.md                           # Engine setup, endpoints, and standalone test commands
│
├── assistant/                              # 🔒 SANDBOX: Feature 2 (feat/ai-assistant) ONLY
│   ├── src/                                # Ollama client, prompt templates, intervention logic, guardrails
│   ├── tests/                              # Prompt tests, safety tests, task decomposition unit tests
│   ├── mocks/                              # Mock engine event replay & offline LLM heuristic fallback
│   ├── requirements.txt / package.json     # Feature 2 isolated dependencies
│   └── README.md                           # Assistant service setup, prompt guide, and test commands
│
├── desktop/                                # 🔒 SANDBOX: Feature 3 (feat/desktop-app) ONLY
│   ├── src/                                # Electron main/renderer, Dashboard UI, Focus Timer, Overlays
│   │   └── services/                       # MockEngineClient & MockAssistantClient (enables offline UI dev)
│   ├── tests/                              # UI integration and store persistence tests
│   ├── package.json                        # Feature 3 isolated dependencies (Electron, UI libs)
│   └── README.md                           # Electron launch commands & mock preview instructions
│
└── README.md                               # Project overview and team coordination rules
```

---

## 3. Five Golden Rules for Parallel, Conflict-Free Development

### Rule 1: Stay in Your Sandbox
- When working on Feature 1, **all** your files must go inside `/engine`.
- When working on Feature 2, **all** your files must go inside `/assistant`.
- When working on Feature 3, **all** your files must go inside `/desktop`.
- **Do not edit files in other teammates' directories.**
- **Do not modify root-level configuration files** (e.g. root `package.json`) unless coordinating a repo-wide upgrade.

### Rule 2: Independent Dependencies
- Each directory manages its own dependencies independently:
  - Feature 1: `engine/requirements.txt` (or `engine/package.json`)
  - Feature 2: `assistant/requirements.txt` (or `assistant/package.json`)
  - Feature 3: `desktop/package.json`
- This ensures dependency changes or version bumps on one branch never break another teammate's environment.

### Rule 3: Develop with Mocks First (Zero Blockers)
- Do not wait for Feature 1 or Feature 2 to be completed before building Feature 3.
- All branches must use the schemas defined in [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md).
- Feature 2 and Feature 3 should use built-in mock event generators / adapters during development. When Feature 1 is ready, swapping from mock to live is a one-line config change.

### Rule 4: Dedicated Port & Service Allocations
- Avoid port collisions when running all services locally:
  - **Feature 1 (Attention Engine)**: Port `5001`
  - **Feature 2 (AI Assistant)**: Port `5002`
  - **Ollama**: Port `11434`
  - **Feature 3 (Electron Desktop)**: Electron Window (communicates via HTTP/IPC with 5001 and 5002)

### Rule 5: Pre-Commit Sandbox Check
Before staging or committing code, run:
```bash
git status
```
Verify that every single changed or new file starts with your assigned folder prefix (`engine/`, `assistant/`, or `desktop/`). If you see modifications to other folders, discard or revert them before committing.

---

## 4. Integration Milestones

```text
Phase 1: Isolated Development
  ├── Teammate 1 builds engine/ with CLI test harness
  ├── Teammate 2 builds assistant/ with mock engine replay & Ollama prompts
  └── Teammate 3 builds desktop/ with MockEngineClient & MockAssistantClient

Phase 2: Contract Validation
  ├── Test engine/ events against docs/SHARED_CONTRACTS.md schema
  ├── Test assistant/ decisions against docs/SHARED_CONTRACTS.md schema
  └── Test desktop/ UI actions against docs/SHARED_CONTRACTS.md schema

Phase 3: Integration & Merge
  ├── Merge feat/attention-engine into main (Changes only engine/)
  ├── Merge feat/ai-assistant into main (Changes only assistant/)
  ├── Merge feat/desktop-app into main (Changes only desktop/)
  └── Flip mock switches in desktop/ to live endpoints on localhost:5001 & localhost:5002
```
