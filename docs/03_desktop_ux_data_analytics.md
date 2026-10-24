# FocusGuard — Feature 3: Desktop UX, Data, Analytics & Integration

## 1. Ownership & Parallel Development Sandbox

> **Branch Name**: `feat/desktop-app`  
> **Dedicated Directory**: `/desktop` (All Electron code, UI components, tests, and dependencies **must** reside here)  
> **Integration Targets**: Feature 1 (`http://127.0.0.1:5001`), Feature 2 (`http://127.0.0.1:5002`)  
> **Shared Contract**: Reference [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md) for data schemas.

### ⚠️ Strict Sandbox Directive for AI Agents and Developers
- **ALLOWED**: Create, modify, and delete files inside `/desktop/**` ONLY.
- **FORBIDDEN**:
  - Do NOT touch `/engine/**` or `/assistant/**`.
  - Do NOT modify root configuration files (`package.json`, `.gitignore`, `README.md`) without team consensus.
  - Do NOT re-implement native window tracking or LLM prompt logic inside Electron.
- **Dependencies**: Keep all dependencies isolated inside `/desktop/package.json`.

---

## 2. Mission & Responsibilities

Turn the background attention engine and the AI assistant into a polished, fluid, and human-centered desktop application.

### In Scope (Your Responsibilities)
- Electron desktop shell (Main process, Preload script, Renderer process).
- Main focus dashboard:
  - Current task display & editable input.
  - Focus session timer (Start, Pause, Resume, Stop).
  - Attention state indicator (color + text icon for accessibility).
  - Task breakdown checklist with active step indicator.
  - Subtle floating widget / tray menu.
- Non-intrusive intervention notifications and gentle overlay modals.
- Focus Recovery UI ("What happened?" with instant recovery choices).
- Break mode overlay with calming timer.
- Settings & Privacy Center (Webcam on/off toggle, Pause monitoring, Clear data).
- Local data persistence (SQLite or typed local JSON file) for session history.
- Analytics dashboard (focused hours, fragmented intervals, recovery count, positive insights).
- **Mock-First Architecture**: Built-in mock clients for Feature 1 and Feature 2 so the UI can be developed, demonstrated, and validated immediately without waiting for other branches.

### Out of Scope (Owned by Other Branches)
- Native OS window hooks, raw idle time listeners, and OpenCV/MediaPipe (Feature 1).
- Ollama prompts, model guardrails, and task decomposition LLM logic (Feature 2).

---

## 3. Mock-First Architecture (Zero-Block Parallel Workflow)

To develop and test the entire UI in parallel without waiting for teammates:

Implement an adapter layer in `desktop/src/services/`:

```typescript
// desktop/src/services/serviceManager.ts
import { LiveEngineClient, MockEngineClient } from './engineClient';
import { LiveAssistantClient, MockAssistantClient } from './assistantClient';

const USE_MOCKS = process.env.VITE_USE_MOCKS === 'true' || true; // Default to true until integrated

export const engineService = USE_MOCKS ? new MockEngineClient() : new LiveEngineClient('http://127.0.0.1:5001');
export const assistantService = USE_MOCKS ? new MockAssistantClient() : new LiveAssistantClient('http://127.0.0.1:5002');
```

### Benefits of the Mock Client:
- **Instant Testing**: Simulate attention state shifts (`FOCUSED` → `DISTRACTED` → `RECOVERING`) with a simple UI dropdown or hotkey.
- **Reliable Demos**: Test interventions and recovery screens without having to open YouTube or trigger OS events.
- **Zero Blocker**: The UI team can finish 100% of their acceptance criteria even if teammates are still working on their branches.
- **Seamless Switch**: When `feat/attention-engine` and `feat/ai-assistant` are ready, simply flip `USE_MOCKS=false`.

---

## 4. User Journey & UI Components

```text
┌────────────────────────────────────────────────────────┐
│  FocusGuard Dashboard                                  │
│                                                        │
│  Current Task: [ Complete project documentation     ]  │
│  Session Timer:  24:18  (● FOCUSED)                    │
│  [ Pause ]  [ End Session ]                            │
│                                                        │
│  Subtasks:                                             │
│  [✓] 1. Define problem & audience (5m)                 │
│  [●] 2. Outline key components (10m)    ◄ Active Step  │
│  [ ] 3. Write integration guide (15m)                  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Recent Insight:                                  │  │
│  │ "You've stayed focused 85% of this session!"     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Privacy: Monitoring [Active] | Camera [Off]           │
└────────────────────────────────────────────────────────┘
```

### 4.1 Gentle Intervention Modal
Triggered when Feature 2 returns `shouldIntervene: true`:
- Non-blocking, gentle toast or corner overlay.
- Clear action buttons matching [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md):
  - `[Return to Task]`
  - `[Break Down Task]`
  - `[Take a Break]`
  - `[Dismiss]`

### 4.2 Focus Recovery Modal
- Displayed when user clicks "I'm stuck" or accepts a recovery prompt:
  - Choices: `[Tired]`, `[Task is confusing]`, `[Got distracted]`, `[Need a break]`.
  - Displays instant supportive feedback from Feature 2.

### 4.3 Analytics & Self-Understanding
- **Focus Time vs. Fragmented Time** (e.g. 2h 15m focused, 25m fragmented).
- **Recovery Count**: Number of times the user successfully refocused.
- **Empathetic Insights**: Highlights wins rather than punitive scores (e.g. "Longest uninterrupted focus session this week").

---

## 5. Local Data Storage & Privacy

- Store user data locally inside the user data directory:
  - Preferences: `{ webcamEnabled: boolean, notifications: boolean }`
  - Sessions: `id, task, startTime, endTime, totalFocusSeconds, recoveryCount`
  - Interventions: `timestamp, triggerReason, userAction`
- **Zero Raw Video**: Never attempt to capture or store raw webcam footage.
- **One-Click Data Purge**: Provide a "Clear All Stored History" button in Settings.

---

## 6. Directory Structure for `/desktop`

```text
desktop/
├── src/
│   ├── main/
│   │   ├── index.ts               # Electron main process & window lifecycle
│   │   ├── ipcHandlers.ts         # IPC bridge for local storage & service calls
│   │   └── tray.ts                # System tray icon and quick actions
│   ├── preload/
│   │   └── index.ts               # Context isolation & secure IPC exposure
│   ├── renderer/
│   │   ├── index.html             # Main entrypoint
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Dashboard.tsx  # Focus timer, active task, attention status
│   │   │   │   ├── SubtaskList.tsx# Task breakdown checklist
│   │   │   │   ├── Intervention.tsx# Non-intrusive nudge toast
│   │   │   │   ├── RecoveryModal.tsx# "What happened?" recovery dialog
│   │   │   │   ├── BreakMode.tsx  # Calming break screen
│   │   │   │   ├── Analytics.tsx  # Empathetic focus trends & insights
│   │   │   │   └── Settings.tsx   # Privacy toggles (webcam, pause, clear data)
│   │   │   ├── services/
│   │   │   │   ├── engineClient.ts# Live SSE/HTTP client for port 5001
│   │   │   │   ├── assistantClient.ts # Live REST client for port 5002
│   │   │   │   ├── mockEngineClient.ts # Synthetic event emitter for offline dev
│   │   │   │   └── mockAssistantClient.ts # Mock AI responses for offline dev
│   │   │   └── store/             # Local state & persistence
│   │   └── styles/                # Clean, premium styling
│   └── tests/
│       ├── unit/                  # Component and store tests
│       └── mockValidation.test.ts # Verify mock payloads match SHARED_CONTRACTS.md
├── package.json                   # Electron, React/Vue/Vite, Tailwind/CSS deps
└── README.md                      # Instructions to launch dev server & toggle mocks
```

---

## 7. Pre-Merge Checklist for `feat/desktop-app`

- [ ] All code, styles, and assets are isolated strictly inside `/desktop`.
- [ ] No files in `/engine`, `/assistant`, or root files were edited.
- [ ] App launches and functions smoothly in Mock Mode (`npm run dev`).
- [ ] All UI schemas conform to `SHARED_CONTRACTS.md`.
- [ ] End-to-end user journey works: Start session → Task breakdown → Intervention → Recovery → Analytics.
- [ ] `git status` shows changes ONLY under `desktop/`.
