# Architecture

Continuous CLI Cockpit is a desktop control plane for real interactive command-line programs.

The core invariant is simple: the primary CLI remains the only executor. The cockpit observes, records, suggests, and optionally injects prompts back into the same terminal session.

## Layers

```text
React UI
  -> preload IPC facade
  -> Electron main process
  -> runner backend
       - pty attached
       - tmux detached
  -> watchdog classification and recovery policy routing
  -> persistence
  -> transcript and export bundle
  -> preset and policy config management
  -> diagnostics, transcript viewer, and cleanup operations
```

## Renderer

The React renderer owns:

- launch form
- preset selection
- runner backend selection
- control mode selection
- xterm.js terminal rendering
- session tabs
- live status display
- timeline display
- manual prompt injection controls
- recovery suggestion controls
- policy editor with recovery routing, circuit breaker, and manual-stop patterns
- prompt presets for short operator actions, professional role templates, task protocols, and subagent-style coordination
- operations controls for preset/policy import-export and ended-session cleanup
- transcript viewer and session diagnostics
- Autopilot pipeline visualization with interrupt control
- Cockpit task tabs for Session, Launch, Automation, and Logs so everyday prompt work is not mixed with advanced policy editing

The renderer does not call Node APIs directly. It uses `window.cliAPI`, exposed by `electron/preload.ts`.

Current renderer module split:

```text
src/App.tsx
  -> components/TitleBar.tsx
  -> components/Sidebar.tsx
  -> components/SessionTabs.tsx
  -> components/TerminalPane.tsx
  -> components/SupervisorPanel.tsx
  -> components/LaunchPanel.tsx
  -> components/PolicyEditor.tsx
  -> components/PromptComposer.tsx
  -> components/AutopilotPipeline.tsx
  -> components/OperationsPanel.tsx
  -> components/TranscriptViewer.tsx
  -> components/SessionDiagnosticsPanel.tsx
  -> components/RunModeSelector.tsx
  -> hooks/useCliSessions.ts
  -> hooks/useLaunchForm.ts
  -> hooks/useSessionControls.ts
  -> hooks/useTerminalBridge.ts
  -> domain/cli.ts
```

## Preload

The preload script exposes a narrow IPC facade:

- `getDefaults`
- `getHealth`
- preset get/set/reset/import/export
- policy get/set/reset/import/export
- `openDirectory`
- `listSessions`
- `createSession`
- `stopSession`
- `reattachSession`
- `setControl`
- `injectLocalContinue`
- `injectPrompt`
- `generateFallback`
- `fallbackAndInject`
- terminal input and resize
- terminal/session events
- transcript read
- session diagnostics
- session export, archive, and clear operations
- window controls

## Main Process

The Electron main process owns:

- session lifecycle
- runner backend management
- terminal data fanout
- watchdog classification
- recovery policy routing
- recovery prompt generation
- prompt-file writing
- transcript file writing
- session export bundle creation
- ended-session archive and cleanup
- preset validation and saving
- policy validation and saving
- transcript reading
- tmux session diagnostics
- persistence
- restore and reattach behavior

The main process is the only layer that can spawn shells or call fallback CLIs.

IPC payloads are runtime-validated in `electron/main.ts` before they can create sessions, send terminal input, resize PTYs, update control mode, or inject prompts. The renderer is sandboxed and context-isolated.

## Session Model

A session stores:

- `id`
- `preset`
- `title`
- `cwd`
- `command`
- `shellKind`
- `runnerBackend`
- `tmuxSessionName`
- `runMode`
- `supervisorProtocol`
- `watchdogEnabled`
- status and status reason
- timestamps
- retry counters
- terminal tail
- transcript path
- last suggested prompt
- timeline events
- attached state

Ephemeral runtime fields such as the live PTY object are not persisted.

## Runner Backends

### pty attached

`pty` starts a shell through `node-pty`. It is best for normal interactive work.

Lifecycle:

```text
create session
  -> spawn shell
  -> send optional command
  -> stream output to xterm
  -> persist terminal tail and events
```

If Electron closes, the PTY session cannot survive. The session history is restored on next launch as an exited history entry.

### tmux detached

`tmux` starts a named tmux session and attaches Electron to it.

Lifecycle:

```text
create session
  -> tmux new-session -d
  -> attach Electron PTY to tmux
  -> send optional command
  -> stream output to xterm
  -> persist terminal tail and events
```

If Electron closes, the tmux session may continue running. On launch, the app loads persisted sessions and tries to reattach to live tmux sessions.

On Windows, tmux is called through WSL.

## Persistence

Session metadata is stored at:

```text
<Electron userData>/continuous/sessions.json
```

Timeline events are appended to:

```text
<Electron userData>/continuous-events/events.jsonl
```

Prompt files are written to the working directory:

```text
<working directory>/.continuous/prompts/
```

Per-session full transcripts are stored at:

```text
<Electron userData>/continuous/transcripts/<session-id>.log
```

Watchdog policy is stored at:

```text
<Electron userData>/continuous/policies/default.json
```

The policy can be edited from the Cockpit panel. The main process validates numeric bounds, regex syntax, recovery rule actions, and circuit-breaker settings before applying it.

CLI presets are stored at:

```text
<Electron userData>/continuous/presets/default.json
```

Presets can be imported, exported, reset, and validated from the Operations panel. A valid preset set must include every known preset key with a title, label, shell kind, and command.

Session exports are written to:

```text
<Electron userData>/continuous/exports/<timestamp>_<session>_<id>/
```

Ended-session archives are written to:

```text
<Electron userData>/continuous/exports/archives/<timestamp>/
```

The persisted terminal tail is intentionally bounded to avoid unbounded app data growth.

## Watchdog

The watchdog classifies sessions into:

- `running`
- `waiting`
- `stalled`
- `blocked`
- `recovering`
- `done`
- `detached`
- `exited`

It checks:

- done markers from the policy file
- waiting patterns from the policy file
- blocked/error patterns from the policy file
- manual intervention patterns from the policy file
- soft idle timeout from the policy file
- hard idle timeout from the policy file

The watchdog only acts automatically in Autopilot mode. In Manual and Assisted modes it records status, but does not auto-inject recovery prompts.

Autopilot actions are routed through recovery rules instead of hardcoded branches:

```text
waiting | soft_stall | hard_stall | blocked | exited | manual_intervention
  -> inject_local_prompt | trigger_fallback_agent | auto_resume | interrupt
```

A circuit breaker switches the session back to Manual mode if repeated recovery actions happen inside the configured window. Manual-intervention matches also interrupt Autopilot immediately.

The renderer maps watchdog state and recovery events into a visible Autopilot pipeline:

```text
Observe -> Evaluate -> Resolve -> Inject -> Cooldown
```

This panel displays the current decision reason, retry/cooldown context, recent prompt-file injection path, and an interrupt action that switches the session back to Manual mode with the watchdog disabled.

The pipeline lives in the `Auto` tab. The default `Session` tab keeps the operator focused on the current CLI state, prompt composer, and quick actions.

## Recovery Prompt Flow

```text
terminal output tail
  -> watchdog classification
  -> recovery policy rule
  -> local prompt, fallback prompt, auto resume, or interrupt
  -> optional Claude/Gemini headless recovery prompt generation
  -> .continuous/prompts/*.md
  -> short instruction injected to primary CLI
```

Fallback agents only generate prompts. They do not run project commands or edit files.

Manual and Assisted modes never auto-inject fallback prompts. Autopilot can inject after watchdog classification, but cooldown and recovery-in-flight checks are audited as timeline events.

Prompt injection submits automatically. For attached PTY sessions the main process writes the instruction text first, waits briefly, sends a separate Enter key, then sends a fallback line-feed for TUI input modes that ignore the first carriage return. For detached tmux sessions without an attached PTY, the app pastes through a tmux buffer and then sends `Enter`. This avoids TUI cases where text appears in the input area but is not submitted.

Manual prompt composition supports three delivery paths. `Send text` writes the prompt body through the normal terminal input IPC path and then sends Enter. The file action writes the prompt to `.continuous/prompts/*.md`, injects a read-this-file instruction, and then submits Enter through the renderer path. The copy action uses the main-process clipboard bridge so the prompt body can be inspected or pasted elsewhere.

## Transcript Viewer

The renderer reads transcript text on demand and renders only a bounded line window. Search highlights matching line numbers and jumps between matches without pushing the full transcript into normal React session state.

Timeline rows seed the transcript search query. This keeps the audit workflow simple: select an event, load the transcript, and page around matching output without loading the transcript into the regular session snapshot.

## Session Diagnostics

For `tmux` sessions, diagnostics check:

- whether the tmux session exists
- attached client count
- pane count
- most recent captured line
- recent pane capture tail

For `pty` sessions, diagnostics make clear that tmux-specific checks do not apply.

## Operations

The Operations panel handles app-level maintenance:

- export/import/reset CLI presets
- export/import/reset watchdog policy through the policy editor and operations controls
- archive ended sessions into audit bundles
- clear ended sessions from the active session list

These operations go through Electron main-process IPC handlers so filesystem writes, JSON parsing, and validation remain outside the sandboxed renderer.
