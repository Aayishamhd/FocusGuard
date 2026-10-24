# FocusGuard — Shared Data Contracts & IPC Protocols

> **Status: FROZEN SPECIFICATION (Version 1.0.0)**  
> **Rule**: Any change to this file requires consensus from all three branch owners (Feature 1, Feature 2, Feature 3).

---

## 1. Overview & Architecture Protocol

FocusGuard components run concurrently and communicate through decoupled, typed contracts. This enables Feature 1 (Attention Engine), Feature 2 (AI Assistant), and Feature 3 (Desktop UI) to be developed, mocked, and tested **completely independently** without git merge conflicts.

```text
┌────────────────────────┐              ┌───────────────────────────┐
│       Feature 1:       │              │        Feature 2:         │
│ Attention Engine       │              │       AI Assistant        │
│ (Port 5001 / IPC)      │              │    (Port 5002 / IPC)      │
└───────────┬────────────┘              └─────────────┬─────────────┘
            │                                         │
            │  AttentionEvent                         │  InterventionDecision
            │  (HTTP / WebSocket / SSE)               │  TaskDecomposition
            │                                         │  RecoveryGuidance
            └────────────────────┬────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       Feature 3:        │
                    │   Desktop UX & Store    │
                    │      (Electron App)     │
                    └─────────────────────────┘
```

---

## 2. Shared Data Contracts

### 2.1 Attention State Enum
```typescript
export type AttentionState = 
  | "FOCUSED"
  | "POSSIBLY_DRIFTING"
  | "DISTRACTED"
  | "RECOVERING"
  | "IDLE";
```

### 2.2 AttentionEvent (Produced by Feature 1, Consumed by Feature 2 & 3)

Emitted periodically (default: every 3–5 seconds) or on significant context changes (e.g. app switch, idle state change).

```typescript
export interface AttentionEvent {
  eventId: string;                  // UUIDv4
  timestamp: string;                // ISO 8601 string, e.g. "2026-10-24T21:50:00.000Z"
  attentionState: AttentionState;   // Inferred state
  confidence: number;               // 0.0 to 1.0
  activeApp: {
    appName: string;                // e.g. "Code", "Google Chrome", "Spotify"
    windowTitle: string;            // Window title (sanitized, no sensitive URLs/tokens)
    category: "work" | "communication" | "entertainment" | "utility" | "unknown";
  };
  metrics: {
    sessionDurationSeconds: number; // Total active session time in seconds
    appDurationSeconds: number;     // Time spent on the current app
    recentSwitchCount: number;      // Number of app switches in the last 5 minutes
    inactivitySeconds: number;      // Continuous seconds of no mouse/keyboard input
    webcamEngaged?: boolean;        // true if user opted into webcam and head/gaze indicates focus
  };
  sources: Array<"window_tracker" | "activity_monitor" | "webcam_headpose">;
}
```

#### JSON Example:
```json
{
  "eventId": "ae-981723-a1",
  "timestamp": "2026-10-24T21:50:00.000Z",
  "attentionState": "POSSIBLY_DRIFTING",
  "confidence": 0.78,
  "activeApp": {
    "appName": "Google Chrome",
    "windowTitle": "YouTube - Lo-Fi Chill Beats",
    "category": "entertainment"
  },
  "metrics": {
    "sessionDurationSeconds": 1840,
    "appDurationSeconds": 240,
    "recentSwitchCount": 5,
    "inactivitySeconds": 15,
    "webcamEngaged": false
  },
  "sources": ["window_tracker", "activity_monitor"]
}
```

---

### 2.3 Intervention Decision & Action (Produced by Feature 2, Consumed by Feature 3)

The AI Assistant evaluates incoming `AttentionEvent` records alongside user preferences and task context, then determines if and how to intervene.

```typescript
export type InterventionLevel = 
  | "LEVEL_0_NONE"
  | "LEVEL_1_GENTLE_REMINDER"
  | "LEVEL_2_RECOVERY_SUGGESTION"
  | "LEVEL_3_ASSISTANCE"
  | "LEVEL_4_BREAK_SUGGESTION";

export interface InterventionDecision {
  decisionId: string;                // UUIDv4
  timestamp: string;                 // ISO 8601
  shouldIntervene: boolean;          // If false, UI takes no action
  level: InterventionLevel;
  triggerReason: string;             // e.g. "Frequent switching between social & editor"
  message?: string;                  // Gentle, user-facing copy
  actions?: Array<{
    actionId: "return_to_task" | "break_down_task" | "take_break" | "dismiss";
    label: string;                   // Button label, e.g. "Return to Coding"
  }>;
  suggestedBreakMinutes?: number;    // Present if level === "LEVEL_4_BREAK_SUGGESTION"
}
```

#### JSON Example:
```json
{
  "decisionId": "id-55102-bc",
  "timestamp": "2026-10-24T21:50:05.000Z",
  "shouldIntervene": true,
  "level": "LEVEL_2_RECOVERY_SUGGESTION",
  "triggerReason": "Detected 5 app switches in 3 minutes during focus session",
  "message": "Looks like you might be switching tasks frequently. Would you like to get back to writing docs?",
  "actions": [
    { "actionId": "return_to_task", "label": "Back to Docs" },
    { "actionId": "break_down_task", "label": "Break into smaller steps" },
    { "actionId": "take_break", "label": "Take a 5 min break" },
    { "actionId": "dismiss", "label": "I'm still focused" }
  ]
}
```

---

### 2.4 Task Breakdown Contract (Feature 3 <-> Feature 2)

#### Request:
```typescript
export interface TaskDecompositionRequest {
  taskDescription: string;          // e.g., "Build the project presentation"
  difficultyLevel?: "quick" | "moderate" | "complex";
  existingSubtasks?: string[];
}
```

#### Response:
```typescript
export interface TaskDecompositionResponse {
  originalTask: string;
  subtasks: Array<{
    stepNumber: number;
    title: string;
    description: string;
    estimatedMinutes: number;
    isImmediateNextStep: boolean;    // Smallest actionable first step
  }>;
}
```

#### JSON Example:
```json
{
  "originalTask": "Build the project presentation",
  "subtasks": [
    {
      "stepNumber": 1,
      "title": "Define the target problem & audience",
      "description": "Write down 2-3 bullet points defining the core focus struggle.",
      "estimatedMinutes": 5,
      "isImmediateNextStep": true
    },
    {
      "stepNumber": 2,
      "title": "Outline 5 key slides",
      "description": "Problem, Solution, Architecture, Demo, Next Steps.",
      "estimatedMinutes": 10,
      "isImmediateNextStep": false
    }
  ]
}
```

---

### 2.5 Focus Recovery Contract (Feature 3 <-> Feature 2)

When a user accepts a recovery suggestion or manually clicks "I'm stuck / Lost focus".

#### Request:
```typescript
export interface RecoveryFeedbackRequest {
  sessionId: string;
  currentTask: string;
  userReason: 
    | "tired" 
    | "task_confusing" 
    | "distracted" 
    | "need_break" 
    | "other";
  notes?: string;
}
```

#### Response:
```typescript
export interface RecoveryFeedbackResponse {
  recommendation: "take_break" | "simplify_task" | "resume_previous" | "custom_tip";
  supportiveMessage: string;
  actionPayload?: {
    suggestedBreakMinutes?: number;
    suggestedNextAction?: string;
  };
}
```

---

## 3. Communication Endpoints & Default Port Allocation

To guarantee zero port conflicts during local testing:

| Component | Default Protocol & Port | Fallback Mode |
|---|---|---|
| **Feature 1 (Attention Engine)** | HTTP/REST `http://127.0.0.1:5001` or SSE `/events` | Simulated event JSON file / mock emitter |
| **Feature 2 (AI Assistant)** | HTTP/REST `http://127.0.0.1:5002` | Local heuristic fallback when Ollama is offline |
| **Ollama Service** | HTTP `http://127.0.0.1:11434` | Built-in rule-based fallback responses |
| **Feature 3 (Electron Desktop)** | Electron App / IPC Renderer-to-Main | Self-contained mock adapters (`MockEngine`, `MockAI`) |

### Standard Endpoints

#### Feature 1 API (`http://127.0.0.1:5001`)
- `GET /health` -> `{ "status": "ok", "webcamActive": boolean }`
- `GET /state/current` -> Returns current `AttentionEvent`
- `GET /events/stream` -> Server-Sent Events (SSE) streaming `AttentionEvent` every 3-5s
- `POST /monitoring/start` -> `{ "success": true }`
- `POST /monitoring/pause` -> `{ "success": true }`

#### Feature 2 API (`http://127.0.0.1:5002`)
- `GET /health` -> `{ "status": "ok", "llmConnected": boolean, "model": string }`
- `POST /api/intervene` -> Accepts `AttentionEvent`, returns `InterventionDecision`
- `POST /api/decompose` -> Accepts `TaskDecompositionRequest`, returns `TaskDecompositionResponse`
- `POST /api/recover` -> Accepts `RecoveryFeedbackRequest`, returns `RecoveryFeedbackResponse`

---

## 4. Contract Stability & Change Protocol

1. **Frozen Status**: Do not modify property names, data types, or enum values in this file unilaterally.
2. **Backward Compatibility**: If a branch requires extra data, add **optional** properties (e.g., `extraData?: string`). Never remove or rename existing required fields.
3. **Mocking Guarantee**: Every branch is expected to provide or embed a mock adapter adhering to these exact schemas.
