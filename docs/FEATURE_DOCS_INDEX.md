# FocusGuard — Feature Documentation

Use one document per teammate/feature branch.

| File | Feature |
|---|---|
| `01_attention_context_engine.md` | Desktop activity, attention estimation, optional webcam, context signals |
| `02_ai_assistant_intervention.md` | Ollama/LLM, task breakdown, interventions, recovery, personalization |
| `03_desktop_ux_data_analytics.md` | Electron UI, persistence, privacy controls, analytics, integration |

Recommended repository location:

```text
docs/
├── 01_attention_context_engine.md
├── 02_ai_assistant_intervention.md
└── 03_desktop_ux_data_analytics.md
```

Keep the boundaries between branches clear. Integrate through stable interfaces instead of duplicating internal logic.
