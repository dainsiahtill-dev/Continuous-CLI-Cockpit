# Implementation Status

This document tracks the current implementation state and the most important remaining work.

## Implemented

### App Shell

- Electron + Vite + React + TypeScript
- TailwindCSS v4 through PostCSS
- hidden native title bar with custom controls
- Flux-inspired terminal layout
- xterm.js terminal pane
- terminal header copy action and `Ctrl+Shift+C` selection copy
- resize synchronization with xterm fit addon
- strict TypeScript enabled for app and Electron code
- modular React component and hook structure
- renderer Error Boundary

### Universal CLI Cockpit

- arbitrary working directory
- editable command
- editable shell backend
- presets for Codex, Codex Resume, Claude, Claude Continue, Gemini, Shell, WSL, and Custom
- persisted preset catalog with import, export, and reset actions
- Manual, Assisted, and Autopilot modes
- optional supervisor protocol
- prompt-file injection
- prompt presets for short actions, role templates, task protocols, and subagent coordination prompts
- Autopilot pipeline visualization with decision reason, cooldown context, prompt-file audit path, and interrupt control
- task-focused Cockpit tabs for Session, Launch, Auto, and Logs
- editable session tab names persisted with session state

### Runner Backends

- `pty` attached runner through `node-pty`
- `tmux` detached runner
- Windows tmux support through WSL
- reattach action for tmux sessions
- runtime health check for tmux and WSL
- session-level diagnostics for tmux sessions, including pane capture tail

### Persistence

- persisted session metadata
- persisted terminal tail
- per-session full transcript files
- persisted timeline events
- persisted prompt injection history through events
- restore on launch
- automatic tmux reattach attempt on launch
- session export bundle
- ended-session archive and clear actions

### Watchdog and Recovery

- waiting pattern detection
- blocked/error pattern detection
- soft idle detection
- hard idle detection
- done marker detection
- local `policies/default.json` watchdog policy
- project-scoped watchdog policy overrides by working directory
- session-scoped copy-on-write watchdog policy overrides
- Autopilot policy preview in the Cockpit panel
- visual policy editor with recovery routing, circuit breaker controls, regex validation, and reset
- policy import and export actions
- local recovery prompt generation
- fallback prompt generation through Claude, then Gemini
- prompt-file injection back into primary CLI
- automatic Enter submission after prompt injection
- injection cooldown audit events
- policy-routed auto resume for exited CLI processes
- manual-intervention pattern detection that interrupts Autopilot
- circuit breaker that prevents repeated recovery loops

### Safety And Quality

- context isolation and BrowserWindow sandbox enabled
- main-process IPC runtime validation
- cybernetic and scientific-method architecture specification
- ESLint, Prettier, TypeScript, Vitest scripts
- Vitest coverage for domain helpers, run-mode selector, and launch form state
- Vitest coverage for prompt preset task insertion
- transcript search viewer with windowed line rendering
- timeline-seeded transcript search

## Known Limitations

### PTY Sessions Are Not Process-Persistent

`pty` sessions restore history after Electron restarts, but the process itself does not survive. Use `tmux` for long-running work.

### tmux Requires WSL on Windows

On Windows, the tmux backend calls WSL. If WSL or tmux is missing, detached sessions will fail to start.

### tmux Input Uses `send-keys`

Prompt injection for tmux currently sends a short single-line instruction. Very complex shell quoting is intentionally avoided because long prompt bodies are written to files.

### Persistence Is Local

Session persistence is local to Electron app data. There is no sync service, database, or cross-machine state.

### Transcript Viewer Is Search-Based

Timeline rows seed transcript search terms, but the app does not yet store byte offsets for exact event-to-line jumps.

## Recommended Next Work

1. Add integration tests for:

- pty shell launch
- session persistence restore
- tmux unavailable path
- tmux attach path
- prompt injection file creation
- project-scoped policy load/save/reset behavior
- policy-routed waiting, blocked, exited, and circuit-breaker behavior
- preset and policy import validation

2. Add retention controls for:

- old transcripts
- old prompt files
- old exports
- old archived sessions

3. Extend transcript viewer with:

- exact event line offsets
- match highlighting inside lines

4. Extend runtime health checks:

- tmux session attached/detached
- last capture time

5. Package and smoke-test the production desktop build outside Vite dev mode.

6. Add control-loop replay and experiment tooling:

- saved transcript replay fixtures
- post-intervention outcome metrics
- policy experiment log with hypothesis, prediction, result, and conclusion
