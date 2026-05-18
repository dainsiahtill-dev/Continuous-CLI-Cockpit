# Blueprint

Continuous CLI Cockpit is a desktop control console for existing command-line tools such as Codex, Claude, Gemini, local shells, and WSL. It must behave like a careful human operator: open the right directory, type the chosen command, observe terminal output, and only assist or continue when the user has enabled that behavior.

The product should not become a replacement agent runtime. The primary CLI remains the executor. The app is a cockpit around real terminals.

## Architecture Diagram

```text
React renderer
  -> App shell
  -> session state hooks
  -> xterm terminal bridge
  -> launch and supervisor panels
  -> preload IPC facade
       -> validated Electron main IPC handlers
       -> session manager
       -> runner backend
            -> node-pty attached shell
            -> tmux detached shell through local tmux or WSL
       -> watchdog classifier
       -> recovery policy router
       -> recovery prompt generator
            -> local continue prompt
            -> Claude headless, then Gemini headless
       -> prompt-file injection
       -> local persistence and event log
       -> preset and policy config files
       -> transcript and export bundle
       -> archive and cleanup operations
```

## Component Tree

```text
App
  ErrorBoundary
  TitleBar
  Sidebar
  main
    SessionTabs
    TerminalPane | EmptyTerminal
      useTerminalBridge
      xterm.js
    SupervisorPanel
      StatusBanner
      Metric
      RunModeSelector
      SessionDiagnosticsPanel
      TranscriptViewer
      LaunchPanel
        useLaunchForm
      PolicyEditor
      OperationsPanel
```

## Module Responsibilities

- `src/App.tsx`: application composition only. It does not own terminal logic, launch defaults, or recovery behavior.
- `src/domain/cli.ts`: immutable UI metadata, enum parsers, formatting helpers, supervisor prompt builder, and session upsert logic.
- `src/hooks/useCliSessions.ts`: renderer-side session snapshots and IPC subscriptions. Electron main remains the source of truth.
- `src/hooks/useLaunchForm.ts`: launch form state, preset-derived defaults, run-mode side effects, and config serialization.
- `src/hooks/useSessionControls.ts`: guarded UI actions for control updates, prompt injection, fallback generation, and tmux reattach.
- `src/hooks/useTerminalBridge.ts`: xterm lifecycle, resize, input forwarding, and high-frequency output handling outside React state.
- `src/components/PolicyEditor.tsx`: bounded policy editing, recovery routing, circuit breaker controls, regex validation feedback, and reset behavior.
- `src/components/OperationsPanel.tsx`: preset/policy import-export-reset actions and ended-session archive/clear controls.
- `src/components/TranscriptViewer.tsx`: on-demand transcript reads, search, paging, and timeline-seeded search terms.
- `src/components/SessionDiagnosticsPanel.tsx`: backend diagnostics, tmux liveness, pane counts, and capture tail display.
- `src/components/*`: presentational surfaces with accessible buttons, compact controls, and bounded layout.
- `electron/preload.ts`: narrow IPC facade. It exposes no Node primitives to the renderer.
- `electron/main.ts`: process spawning, tmux control, IPC runtime validation, watchdog classification, recovery prompt generation, persistence, and audit events.

## Core Data Flow

```text
LaunchPanel form
  -> CliSessionConfig
  -> cli:create IPC
  -> main validates payload
  -> create session and runner
  -> broadcast snapshot
  -> useCliSessions upserts snapshot
  -> TerminalPane subscribes to terminal data

Terminal output
  -> main appendOutput
  -> bounded outputTail
  -> xterm stream event
  -> watchdog classification
  -> optional status update
  -> optional recovery prompt in Autopilot

Recovery
  -> watchdog state
  -> recovery policy rule
  -> local prompt, fallback agent prompt, auto resume, or interrupt
  -> write .continuous/prompts/*.md
  -> inject one-line file-read instruction
  -> append audit event
  -> broadcast updated snapshot

Operations
  -> import/export preset or policy JSON
  -> main-process validation
  -> save under Electron userData
  -> refresh renderer defaults
  -> archive or clear ended session snapshots
```

## State Model

The durable session snapshot contains identity, working directory, selected CLI preset, command, shell, runner backend, run mode, watchdog toggles, status, retry counters, terminal tail, transcript path, last suggested prompt, timeline events, and attach state.

The live PTY object is never persisted. `pty` sessions restore history only. `tmux` sessions can survive Electron shutdown and can be reattached if the tmux process still exists.

Preset and watchdog policy JSON files are app-level state. They are validated in the main process before use so the renderer cannot install malformed regex rules, invalid recovery actions, unsafe routing, or incomplete CLI presets.

## UX Principles

- First screen is the actual control console, not a landing page.
- The launch form starts any CLI in any directory without forcing a workflow.
- Manual mode is the default. Automation is explicit.
- Assisted mode suggests but does not inject automatically.
- Autopilot is reserved for long-running work where continuation is acceptable.
- Prompt injection is auditable through prompt files instead of invisible large pastes.
- The UI avoids strategy jargon. It exposes operational facts: mode, shell, runner, attach state, idle time, cooldown, retries, and timeline.
- Terminal output stays visually dominant; the right panel is compact and task-focused.

## Technology Choices

- Electron provides desktop shell access and persistent window controls.
- Vite keeps renderer and Electron builds fast.
- React with custom hooks separates view from terminal/session logic.
- TypeScript strict mode protects renderer and main-process contracts.
- TailwindCSS provides compact utility styling, with design tokens in `tailwind.config.ts`.
- xterm.js renders real terminal streams without pushing output through React state.
- `node-pty` supports attached interactive sessions.
- `tmux` supports long-running detached sessions.
- Vitest and Testing Library cover domain helpers, UI controls, and form behavior.

## Performance Strategy

- Terminal bytes are streamed directly into xterm instead of stored in React render state.
- Session output tails are bounded to avoid unbounded memory and persistence growth.
- Full terminal transcripts are written to per-session files outside React state.
- Events are capped per session while still appended to JSONL audit logs.
- React state is limited to snapshots and form/control state.
- The renderer is split into focused modules to reduce re-render blast radius.
- Future heavy views such as full transcripts should be virtualized.

## Security And Safety Boundaries

- Renderer has no Node integration.
- BrowserWindow runs with context isolation and sandbox enabled.
- Main process validates IPC payloads before creating sessions, injecting prompts, resizing PTYs, or writing input.
- Fallback agents only generate recovery prompts. They do not edit files or run project commands.
- Autopilot uses a local watchdog policy file for thresholds, markers, patterns, recovery rules, and circuit-breaker limits.
- Autopilot injection observes cooldown and records skipped recovery events.
- Manual-intervention patterns and circuit breaking force Autopilot back to Manual mode instead of looping.
- Long prompts are written to project-local files before a short terminal instruction is injected.
- Session export bundles metadata, events, output tail, transcript, policy, and last recovery suggestion for review.
- The UI includes policy editing/import/export, preset import/export/reset, transcript search/windowed rendering, timeline-seeded transcript lookup, session diagnostics, and ended-session archive/clear operations.

## Current Best Next Step

The most valuable next improvement is integration hardening around the real runner boundary and policy execution path:

- integration tests for pty launch, prompt-file creation, policy import, preset import, and tmux-unavailable paths
- smoke tests for policy-routed waiting, blocked, exited, and circuit-breaker behavior
- packaged-app smoke testing outside the Vite dev server
- first-run diagnostics that explain WSL/tmux readiness before a user starts a detached session
- retention settings for old transcripts, prompt files, exports, and archives

This improves reliability without changing the core invariant that the real CLI remains the only executor.
