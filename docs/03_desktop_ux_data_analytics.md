# FocusGuard — Feature 3: Desktop UX, Data, Analytics & Integration

## Antigravity Prompt

You own **Feature 3: Desktop UX, Data, Analytics & Integration**.

Turn the attention engine and AI assistant into a polished, usable desktop product.

### Own these features

- Electron desktop application
- Main dashboard
- Focus session controls
- Current task UI
- Attention status
- Intervention UI
- Focus recovery UI
- Task breakdown UI
- Break mode
- Settings
- Privacy controls
- Local persistence
- Focus session history
- Focus analytics
- Pattern/insight presentation
- Integration with Feature 1
- Integration with Feature 2

### Main journey

```text
Open FocusGuard
      ↓
Choose monitoring/privacy settings
      ↓
Enter a task
      ↓
Start focus session
      ↓
Attention engine runs
      ↓
AI decides whether intervention is useful
      ↓
User receives gentle assistance
      ↓
Recover / ask for help / take a break
      ↓
Session ends
      ↓
Analytics and positive insight
```

### Dashboard

Clearly show:

- Current task
- Focus timer
- Current attention state
- Start/pause/stop
- Latest intervention
- Recovery action
- Break action
- Task steps
- Session summary

Avoid overwhelming users with internal technical data.

### Intervention UI

Example:

> **Looks like your focus may have drifted.**
>
> Want to return to your presentation?

```text
[Return] [I'm stuck] [Take a break] [Dismiss]
```

Never trap the user.

### Recovery UI

Render:

```text
What happened?

[I'm tired]
[The task is confusing]
[I got distracted]
[I need a break]
[Something else]
```

Then display the AI response and make continuing frictionless.

### Task breakdown UI

If the AI returns:

```text
1. Define the problem
2. Explain the solution
3. Create architecture
4. Prepare demo
```

display the steps as actionable items and let the user select the current step.

### Analytics

Avoid simplistic productivity scores such as:

> Productivity: 42/100

Prefer:

```text
Focused: 2h 14m
Fragmented: 47m
Recovery moments: 3
```

Useful insight:

> Your attention tends to drift when switching between multiple tasks.

Positive insight:

> You completed your longest uninterrupted focus session this week.

Analytics should support self-understanding, not judgment.

### Local data

Persist only what the MVP needs:

- User preferences
- Focus sessions
- Aggregated attention events
- Intervention history
- Tasks
- Recovery events
- Break events
- Aggregated patterns

Never store raw webcam frames.

### Privacy controls

Provide obvious controls for:

- Monitoring on/off
- Webcam on/off
- Pause monitoring
- Data/settings management
- Explanation of local processing
- Explanation of stored data

The user must always know whether monitoring is active.

### Integration

Consume Feature 1:

- Attention state
- Confidence
- Active application
- Recent activity/switching signals
- Session information

Consume Feature 2:

- Intervention actions
- AI messages
- Task steps
- Recovery assistance
- Break recommendations
- Personalization updates

Do not duplicate their internal logic.

### Reliability

Handle:

- AI unavailable
- Ollama unavailable
- Webcam unavailable
- Permission denied
- Monitoring paused
- Invalid AI response
- Slow AI response
- Empty task
- Session interruption
- Monitoring failure

Every asynchronous AI operation needs a loading state and an error/retry path where appropriate.

### Accessibility and UX

Use:

- Clear typography
- Strong hierarchy
- Keyboard-friendly controls
- Readable notifications
- Responsive layout
- Clear active/inactive states
- Non-color-only status indicators
- Minimal interaction friction

The product should feel like a real desktop application, not a static hackathon dashboard.

### Acceptance criteria

1. User can start/stop a focus session.
2. User can enter a task.
3. Attention state is visible.
4. AI interventions appear correctly.
5. Recovery flow works end-to-end.
6. Task breakdown is displayed and actionable.
7. Break mode works.
8. Settings and privacy controls work.
9. Sessions persist locally.
10. Basic analytics are displayed.
11. Loading/error states exist.
12. App remains usable when AI/webcam services are unavailable.
13. Full demo works without manually editing data.

### Antigravity instruction

Inspect the repository before changing architecture.

Do not create fake monitoring values or fake AI responses for the main demo path.

Use Feature 1 and Feature 2 through their documented interfaces.

Prioritize a polished, reliable end-to-end journey over secondary screens.
