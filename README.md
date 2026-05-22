# Continuous CLI Cockpit

Electron + Vite + React + TypeScript + TailwindCSS cockpit for running real command-line tools such as Codex, Claude, Gemini, WSL, or any custom shell command.

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Blueprint](docs/BLUEPRINT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Control System Architecture](docs/CONTROL_SYSTEM_ARCHITECTURE.md)
- [Recovery Policy](docs/RECOVERY_POLICY.md)
- [Operations Runbook](docs/RUNBOOK.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)

## Core Idea

This app is not a replacement workflow engine for Codex, Claude, or Gemini. It opens a real shell in any directory and sends the exact command a human would type.

The cockpit adds observation, history, recovery suggestions, prompt-file injection, and optional long-running process survival.

## What It Does

- Runs real interactive CLIs with xterm.js.
- Starts in any working directory.
- Treats Codex, Claude, Gemini, WSL, and shell as editable presets.
- Persists editable CLI presets and supports preset import/export/reset.
- Supports Manual, Assisted, and Autopilot control modes.
- Shows an Autopilot pipeline for Observe, Evaluate, Resolve, Inject, and Cooldown.
- Saves session metadata, recent terminal output, event timelines, and prompt injection history.
- Writes per-session full transcripts.
- Exports session audit bundles.
- Uses a local watchdog policy file for Autopilot thresholds, patterns, recovery routing, and circuit breaking.
- Supports project-scoped Autopilot policy overrides by working directory.
- Supports session-scoped Copy-on-Write policy overrides for isolated prompt experiments.
- Imports, exports, edits, validates, and resets watchdog policies from the UI.
- Lets session tabs be renamed and persists those names with the session.
- Checks tmux and WSL runtime health from the Cockpit panel.
- Searches transcript files with bounded line rendering and timeline-seeded search.
- Shows session-level diagnostics for tmux sessions, including capture tail.
- Archives or clears ended sessions from the Operations panel.
- Supports `pty` for normal attached sessions and `tmux` for detached long-running sessions.
- Writes long prompts to `.continuous/prompts/*.md` and injects only a short read-this-file instruction.
- Provides prompt presets for short operator actions, professional roles, task protocols, and subagent-style coordination.
- Optionally enables `.agent-supervisor` files for long-running tasks.

## Runner Backends

### pty

The default backend. It starts a normal shell process through `node-pty`.

Use it for everyday interactive work. If Electron exits, the pty process exits too, but the cockpit restores the saved session history on next launch.

### tmux

The long-running backend. It starts a detached tmux session, then attaches the Electron terminal to it.

Use it for Codex, Claude, Gemini, benchmarks, long repairs, and anything that should survive the Electron window closing. If Electron exits, tmux keeps running. On next launch, the cockpit tries to reattach automatically.

On Windows, the tmux backend uses WSL:

```bash
wsl.exe tmux ...
```

So WSL and tmux must be installed for detached sessions on Windows.

## Control Modes

- Manual: open a real shell or CLI and leave control to the human.
- Assisted: observe output and generate recovery suggestions on demand.
- Autopilot: observe output, route the detected state through the recovery policy, then inject, resume, escalate to fallback, or interrupt.

## Persistence

Session state is persisted under Electron's app data directory:

```text
<Electron userData>/continuous/sessions.json
<Electron userData>/continuous-events/events.jsonl
```

Project-local prompt files are written under:

```text
<working directory>/.continuous/prompts/
```

Full transcripts, policies, and exports are stored under:

```text
<Electron userData>/continuous/transcripts/
<Electron userData>/continuous/policies/default.json
<Electron userData>/continuous/policies/projects.json
<Electron userData>/continuous/presets/default.json
<Electron userData>/continuous/exports/
```

Project policies are selected by session working directory. A session can also carry its own Copy-on-Write override. If neither exists, the session uses the default policy.

## CLI Flow

```text
real shell in cwd
  -> exact human CLI command
  -> terminal observation
  -> optional suggestion generation
  -> optional prompt-file injection
  -> same primary CLI continues
```

Fallback agents only generate recovery prompts. They do not edit the project or run benchmarks directly.

## Autopilot Recovery Policy

Autopilot routes terminal states through configurable rules:

```text
waiting | soft_stall | hard_stall | blocked | exited | manual_intervention
  -> inject_local_prompt | trigger_fallback_agent | auto_resume | interrupt
```

The circuit breaker stops repeated recovery loops and returns the session to Manual mode.

## Commands

```bash
npm install
npm run dev
npm run dev:renderer
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

The dev server uses `http://127.0.0.1:8438`; `npm run dev` starts Vite and lets `vite-plugin-electron` launch a single Electron desktop window.

Use `npm run dev:renderer` only when you intentionally want the browser preview. A normal browser cannot control local shells, so it will show the Electron bridge unavailable fallback.

## Current Status

The current implementation includes session persistence, transcript files, transcript search, export bundles, prompt-file injection, preset management, policy editing/import/export, ended-session archive/clear actions, strict TypeScript, runtime IPC validation, a `pty` runner, a `tmux` detached runner, modular React hooks/components, and UI controls for Manual, Assisted, and Autopilot modes.

On this Windows machine, the `tmux` backend requires WSL tmux to be installed before detached sessions can run:

```bash
sudo apt update
sudo apt install -y tmux
```
