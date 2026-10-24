# FocusGuard — Feature 1: Attention & Context Engine

## Antigravity Prompt

You own **Feature 1: Attention & Context Engine**.

Build the sensing layer that understands what the user is doing and estimates whether attention may be stable, drifting, distracted, or recovering.

### Own these features

- Desktop activity monitoring
- Active application/window tracking
- Application switching detection
- Activity duration and inactivity detection
- Productive-vs-potentially-distracting context signals
- Attention-state estimation
- Optional webcam attention signals
- OpenCV / MediaPipe integration
- Local webcam processing
- Privacy-safe handling of visual data

### Attention states

```text
FOCUSED
POSSIBLY_DRIFTING
DISTRACTED
RECOVERING
IDLE
```

These are product states, **not medical or psychological diagnoses**.

### Important behavior

Do not treat every application switch as distraction.

```text
VS Code → Browser → Documentation → VS Code
```

can be productive.

```text
VS Code → Social Media → Video → Chat → Browser
```

may indicate potential attention drift.

Expose signals and confidence so the AI layer can make the final intervention decision.

### Suggested event contract

```json
{
  "timestamp": "...",
  "active_app": "VS Code",
  "previous_app": "Chrome",
  "session_duration": 1420,
  "switch_count_recent": 3,
  "inactivity_seconds": 0,
  "attention_state": "POSSIBLY_DRIFTING",
  "confidence": 0.72,
  "source": ["desktop_activity"]
}
```

Keep this interface stable for the other branches.

### Webcam

Webcam monitoring is optional and user-controlled.

```text
Webcam
  ↓
OpenCV / MediaPipe
  ↓
Attention-related signal
  ↓
Raw frame discarded
```

Never store raw webcam video. Do not implement facial recognition or diagnose emotions/mental conditions.

### Engineering requirements

- Modular implementation.
- Desktop and webcam components independently testable.
- Graceful handling of permissions and unavailable devices.
- Configurable thresholds.
- Unit tests for state transitions.
- Tests for likely false positives.
- Logs must not leak sensitive data.
- Document OS-specific limitations.

### Do not implement

- LLM prompting
- Task decomposition
- Intervention wording
- Electron dashboard
- Long-term analytics
- Personalization logic

Those belong to the other branches.

### Acceptance criteria

1. Current application can be detected.
2. Application switches can be recorded.
3. Activity duration can be measured.
4. Basic attention states are generated.
5. Productive switching is not automatically classified as distraction.
6. Optional webcam processing works when enabled.
7. Webcam failure is handled gracefully.
8. Raw webcam video is never persisted.
9. A documented event/API contract exists.
10. Another branch can consume attention events without knowing internal implementation.

### Antigravity instruction

Inspect the repository before coding and follow existing conventions.

Build the smallest reliable implementation first. Do not create fake monitoring values for the main demo path.

If an OS capability cannot be implemented reliably, isolate it behind an interface and provide a documented fallback instead of pretending it works.
