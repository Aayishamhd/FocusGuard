# FocusGuard Desktop

AI-powered attention companion — Electron + React + TypeScript + Vite.

> **Branch**: `feature/frontend` · **Feature Doc**: `docs/03_desktop_ux_data_analytics.md`

---

## Quick Start

```bash
cd desktop
npm install
npm run dev        # Starts Vite dev server (browser/mock mode)
```

To run the full Electron app (requires Electron to be installed):

```bash
npm run build         # Build renderer + Electron main/preload
npm run electron:dev  # Launch Electron loading dist-electron/
```

---

## Mock Mode (Default)

The app starts in **mock mode** by default — no backend services needed.

The mock engine cycles through a realistic attention scenario:
`FOCUSED → POSSIBLY_DRIFTING → DISTRACTED → RECOVERING → FOCUSED`

Every 4 seconds a new event is emitted, and every 8 seconds the assistant evaluates
whether to show an intervention toast.

To switch to **live mode**, create/edit `desktop/.env.local`:

```env
VITE_USE_MOCKS=false
VITE_ENGINE_URL=http://127.0.0.1:5001
VITE_ASSISTANT_URL=http://127.0.0.1:5002
```

Then restart `npm run dev`. Live mode requires Feature 1 (port 5001) and Feature 2 (port 5002) to be running.

---

## Running Tests

```bash
npm test                 # Run all tests once
npm run test:watch       # Run tests in watch mode
```

Test files:
- `tests/unit/liveServiceIntegration.test.ts` — Validates contract endpoint routing for Engine and Assistant, schema validation, transient retry with backoff, timeouts, partial failure resilience, and SSE deduplication (19 tests)
- `tests/unit/storageManager.test.ts` — Validates atomic writes, recovery from malformed files, session payload validation, preferences persistence, data purge, and path sandbox isolation (10 tests)
- `tests/unit/persistenceAndAnalytics.test.tsx` — Validates real analytics calculations, paused-time exclusion, 7-day focus trends, positive insights, webcam toggle (defaults to off), monitoring pause failures, and data purge confirmation (10 tests)
- `tests/unit/assistantAndRecovery.test.tsx` — Validates task breakdown workflow, gentle interventions (L1-L4), focus recovery ("What happened?"), break mode countdown & breathing pacer, and mock simulation knobs (22 tests)
- `tests/unit/sessionManagement.test.ts` — Validates session transitions, timer accuracy, pause accounting, task validation, subtask progression, and attention rendering (26 tests)
- `tests/unit/dashboardComponents.test.tsx` — Validates React UI components, accessibility, modal confirmation, and progress bar calculations (19 tests)
- `tests/unit/serviceManager.test.ts` — Validates mock/live selection logic (9 tests)
- `tests/mockValidation.test.ts` — Validates all mock payloads against `SHARED_CONTRACTS.md` schemas (12 tests)

---

## Storage Architecture & Design Rationale

FocusGuard employs a **typed JSON persistence layer with atomic writes** inside the Electron application's `userData/focusguard` directory:

### Why Typed Atomic JSON over Native SQLite:
1. **Cross-Platform Portability**: Native C++ SQLite modules (like `better-sqlite3`) require rebuilding against Electron's Node headers (`node-gyp`), frequently breaking across different OS targets, architectures, and CI/CD pipelines.
2. **Reliable Testability**: A typed JSON layer with atomic file operations runs deterministically in both Node.js (main process) and JSDom/Vitest environments without native binary bindings.
3. **Atomic Write Guarantees**: Every write writes to a unique temporary file (`<name>.<epoch>.<random>.tmp`), flushes to disk, and executes an atomic POSIX/NTFS rename (`fs.renameSync`). Power failure or sudden process termination never results in half-written or corrupted files.
4. **Malformed File Self-Healing**: If a JSON file is corrupted or tampered with externally, `StorageManager` backs up the corrupt file to `<name>.corrupt.<epoch>` and safely re-initializes with validated defaults without crashing the app.
5. **Strict Sandbox**: Storage operations are strictly isolated to `app.getPath("userData")/focusguard`. Directory traversal is blocked using `path.basename`.

### Storage Limitations:
- Designed for single-user desktop companion workloads (hundreds to thousands of sessions).
- File operations are synchronous; for massive enterprise audit logs (tens of thousands of records), a SQLite or indexed database would provide better paging and index querying.

---

## Privacy Guarantee

- **Zero Raw Video Footage**: FocusGuard never captures, stores, or transmits webcam frames. Webcam engagement tracking (Feature 1) calculates head-pose estimates in volatile memory only.
- **Webcam Monitoring Defaults to Off**: Physical camera engagement tracking is strictly opt-in.
- **Data Stored Locally**: All session records, intervention logs, and preferences reside exclusively inside Electron's `userData/focusguard` directory.
- **One-Click Data Purge**: Users can permanently delete all session history, intervention records, and cached metrics from Settings without affecting external files.

