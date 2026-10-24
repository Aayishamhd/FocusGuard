# FocusGuard — Feature 1: Attention & Context Engine

## 1. Ownership & Parallel Development Sandbox

> **Branch Name**: `feat/attention-engine`  
> **Dedicated Directory**: `/engine` (All code, tests, mocks, and dependencies **must** reside here)  
> **Service Port**: `http://127.0.0.1:5001`  
> **Shared Contract**: Reference [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md) for data schemas.

### ⚠️ Strict Sandbox Directive for AI Agents and Developers
- **ALLOWED**: Create, modify, and delete files inside `/engine/**` ONLY.
- **FORBIDDEN**:
  - Do NOT touch `/assistant/**` or `/desktop/**`.
  - Do NOT modify root-level configuration files (`package.json`, `.gitignore`, `README.md`) without team consensus.
  - Do NOT assume the UI or LLM is running during your tests.
- **Dependencies**: Keep all dependencies isolated inside `/engine/requirements.txt` (Python) or `/engine/package.json` (Node.js).

---

## 2. Mission & Responsibilities

Build the background sensing layer that understands user activity on the desktop and accurately estimates whether attention is stable, drifting, distracted, recovering, or idle.

### In Scope (Your Responsibilities)
- Desktop active window & process tracking (title and executable name).
- Window focus switching frequency and time-in-app tracking.
- System inactivity (mouse & keyboard idle timer).
- Heuristic categorization (Work, Communication, Utility, Distraction).
- Attention state estimation and confidence scoring.
- Optional privacy-first webcam monitoring (MediaPipe/OpenCV head-pose & gaze estimation).
- Zero-retention privacy pipeline (raw frames dropped immediately in memory).
- Exposing a local HTTP / SSE event stream on port `5001`.
- Providing a **synthetic event generator CLI** so Feature 2 and Feature 3 can test without OS hooks.

### Out of Scope (Owned by Other Branches)
- LLM prompting and task breakdown (Feature 2).
- Intervention copy and gentle user nudges (Feature 2).
- Electron dashboard, tray icons, notifications, and UI components (Feature 3).
- SQLite session persistence and historical analytics (Feature 3).

---

## 3. Product Attention States

FocusGuard operates with five clear states. These are product attention states, **not medical or psychological diagnoses**:

```text
┌─────────────────┐      Rapid Leisure Switches / Idle Drift      ┌─────────────────┐
│     FOCUSED     │ ────────────────────────────────────────────► │POSSIBLY_DRIFTING│
└────────┬────────┘                                               └────────┬────────┘
         │                                                                 │
         │ Resumed Work                                                    │ Sustained Off-Task
         │                                                                 ▼
┌────────┴────────┐      User refocuses on task                   ┌─────────────────┐
│   RECOVERING    │ ◄──────────────────────────────────────────── │   DISTRACTED    │
└─────────────────┘                                               └─────────────────┘
         ▲                                                                 │
         │                                                                 │ Inactivity > 120s
         │                                                                 ▼
         └────────────────── Keyboard/Mouse Resumed ────────────── ┌─────────────────┐
                                                                  │      IDLE       │
                                                                  └─────────────────┘
```

### Distraction Filtering Rules
Do **not** treat every application switch as distraction:
- **Productive Multi-Tasking**: `VS Code → Chrome (Stack Overflow / Docs) → Terminal → VS Code` within 2 minutes is productive workflow.
- **Potential Drift**: `VS Code → YouTube → Twitter/X → Reddit → Instagram Web` indicates attention drift.
- Categorize domains/apps gently: provide confidence scores (0.0 to 1.0) rather than binary verdicts.

---

## 4. Frozen Data Contract (`AttentionEvent`)

Your engine must publish events strictly matching the specification in [`SHARED_CONTRACTS.md`](file:///c:/Users/ASUS/OneDrive/Desktop/FocusGuard/docs/SHARED_CONTRACTS.md):

```typescript
export interface AttentionEvent {
  eventId: string;                  // e.g. "ae-981723-a1"
  timestamp: string;                // ISO 8601
  attentionState: "FOCUSED" | "POSSIBLY_DRIFTING" | "DISTRACTED" | "RECOVERING" | "IDLE";
  confidence: number;               // 0.0 to 1.0
  activeApp: {
    appName: string;                // e.g. "Code", "Google Chrome"
    windowTitle: string;            // Sanitized window title
    category: "work" | "communication" | "entertainment" | "utility" | "unknown";
  };
  metrics: {
    sessionDurationSeconds: number; // Elapsed session time
    appDurationSeconds: number;     // Elapsed time in current app
    recentSwitchCount: number;      // Switches in the last 5 minutes
    inactivitySeconds: number;      // Seconds since last user input
    webcamEngaged?: boolean;        // Optional visual engagement flag
  };
  sources: Array<"window_tracker" | "activity_monitor" | "webcam_headpose">;
}
```

---

## 5. Local Service API (`http://127.0.0.1:5001`)

Feature 1 exposes a lightweight local HTTP server:

| Endpoint | Method | Response / Description |
|---|---|---|
| `/health` | `GET` | `{ "status": "ok", "webcamEnabled": boolean, "trackingActive": boolean }` |
| `/state/current` | `GET` | Returns latest `AttentionEvent` JSON |
| `/events/stream` | `GET` | Server-Sent Events (SSE) streaming an `AttentionEvent` every 3-5 seconds |
| `/monitoring/start` | `POST` | Start or resume desktop tracking |
| `/monitoring/pause` | `POST` | Pause desktop tracking (e.g. user toggled privacy pause) |

---

## 6. Webcam Privacy Architecture

Webcam tracking is strictly **opt-in**, local-only, and privacy-preserving:
1. Video frames are captured directly to memory via OpenCV.
2. MediaPipe Face Mesh detects facial landmark vectors (head pitch, yaw, roll, and eye openness score).
3. Extract high-level scalar: `webcamEngaged: true/false`.
4. **Immediate Discard**: The raw video frame buffer is immediately cleared.
5. **Zero Persistence**: No frames or video files may ever be written to disk or transmitted over the network.
6. **Graceful Fallback**: If the webcam is disabled, in use by Zoom/Teams, or permission is denied, set `sources: ["window_tracker", "activity_monitor"]` and do not crash.

---

## 7. Teammate Support: Synthetic Event Generator

To enable Feature 2 and Feature 3 teammates to test without running native OS monitors, provide a mock CLI in `engine/mocks/generate_synthetic_events`:

```bash
# Example mock commands Feature 2 or 3 teammates can run:
python engine/mocks/generate_synthetic_events.py --scenario productive-flow
python engine/mocks/generate_synthetic_events.py --scenario rapid-distraction --state DISTRACTED
python engine/mocks/generate_synthetic_events.py --serve --port 5001
```

---

## 8. Directory Structure for `/engine`

```text
engine/
├── src/
│   ├── tracker/
│   │   ├── window_monitor.py      # Active window & app category classifier
│   │   └── input_idle.py          # Mouse/keyboard inactivity listener
│   ├── visual/
│   │   ├── head_pose.py           # In-memory MediaPipe landmarks (discarding frames)
│   │   └── camera_manager.py      # Safe camera lifecycle & fallback
│   ├── state_engine.py            # Attention state transitions & confidence scoring
│   └── server.py                  # Local HTTP/SSE server (Port 5001)
├── mocks/
│   └── generate_synthetic_events.py # CLI for teammates to simulate engine events
├── tests/
│   ├── test_state_transitions.py  # Verify FOCUSED -> DRIFTING -> DISTRACTED logic
│   ├── test_false_positives.py    # Verify dev app-switching is not marked DISTRACTED
│   └── test_privacy_nodisk.py     # Verify raw frames are never persisted
├── requirements.txt               # opencv-python-headless, mediapipe, pygetwindow, etc.
└── README.md                      # Instructions on how to run and test engine locally
```

---

## 9. Pre-Merge Checklist for `feat/attention-engine`

- [ ] All code and dependencies are located exclusively in `/engine`.
- [ ] No files in `/assistant`, `/desktop`, or root files were edited.
- [ ] Local server passes `GET /health` and streams valid `AttentionEvent` JSON.
- [ ] Unit tests pass: `pytest engine/tests/`.
- [ ] Synthetic event generator works and outputs valid JSON according to `SHARED_CONTRACTS.md`.
- [ ] `git status` shows changes ONLY under `engine/`.
