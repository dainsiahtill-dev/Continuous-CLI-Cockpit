# User Guide

Continuous CLI Cockpit runs real command-line tools in a desktop terminal surface. It does not replace Codex, Claude, Gemini, or shell behavior. It opens a shell in the directory you choose and sends the command you choose.

## Quick Start

1. Run the app:

```bash
npm run dev
```

This opens the Electron desktop window. Do not use a normal browser tab for shell control; browser preview does not have the Electron bridge.

2. In the Cockpit panel, choose a preset:

- Codex
- Codex Resume
- Claude
- Claude Continue
- Gemini
- Shell
- WSL
- Custom

3. Choose a working directory.

4. Choose a runner backend:

- `pty attached` for normal interactive sessions.
- `tmux detached` for long-running sessions that should survive Electron closing.

The Cockpit panel shows runtime health for tmux and WSL before launch.

5. Choose a control mode:

- Manual
- Assisted
- Autopilot

6. Start the CLI.

## Presets

Presets are editable shortcuts. They do not force any product-specific workflow.

| Preset          | Default command               |
| --------------- | ----------------------------- |
| Codex           | `codex`                       |
| Codex Resume    | `codex resume --last`         |
| Claude          | `claude`                      |
| Claude Continue | `claude -c`                   |
| Gemini          | `gemini`                      |
| Shell           | empty command                 |
| WSL             | empty command using WSL shell |
| Custom          | empty command                 |

You can edit the command before launching.

Use Operations to export, import, or reset the preset catalog. Imported presets are validated before the app uses them.

## Runner Backends

### pty attached

Use `pty attached` for everyday terminal work. The process is owned by the Electron app. If Electron exits, the process exits. The saved session history is restored on the next launch, but the process itself is not.

### tmux detached

Use `tmux detached` for long-running tasks. The CLI runs inside tmux. Electron attaches to the tmux session for display and input.

If Electron exits, the tmux session can keep running. On the next launch, the app tries to reattach. If a tmux session is restored but not attached, use the `Reattach` button.

On Windows, this backend uses WSL:

```bash
wsl.exe tmux ...
```

WSL and tmux must be installed.

## Control Modes

### Manual

The app behaves like a terminal cockpit. It observes and records, but it does not inject recovery prompts automatically.

Use this for ordinary Codex, Claude, Gemini, or shell usage.

### Assisted

The app observes and records. You can ask it to generate a recovery suggestion, but it will not automatically inject that suggestion unless you click the injection action.

Use this when you want help without automatic control.

### Autopilot

The app observes output for waiting, stall, blocked, exited, and manual-intervention states. If a recovery path is triggered, it routes the state through the Autopilot policy and can inject a prompt, call a fallback prompt generator, send a resume command, or interrupt back to Manual mode.

Use this only for long-running work where automated continuation is acceptable.

The selected session also shows an `Autopilot pipeline` in the Cockpit panel:

- `Observe`: the watchdog is checking terminal output.
- `Evaluate`: a waiting, stalled, or blocked condition was detected.
- `Resolve`: the app is preparing a local or fallback recovery prompt.
- `Inject`: a prompt file instruction was just sent to the primary CLI.
- `Cooldown`: automatic injection is temporarily paused to avoid repeated prompts.

The panel shows the current decision reason, local retry count, cooldown timing, and the last prompt file path when available. Use `Interrupt` to immediately switch the session back to Manual mode and disable the watchdog.

## Prompt Injection

Long prompts are not pasted directly into the terminal. The app writes them under:

```text
<working directory>/.continuous/prompts/
```

Then it injects a short instruction telling the CLI to read that file.

This keeps terminal input stable and makes injected prompts auditable.

The app submits injected prompt instructions automatically. Direct send and manual Enter use the same IPC path as normal terminal keypresses. File injection writes the read-this-file instruction into the terminal, then submits it after a short delay.

For manual prompt injection, the small Enter button beside the composer sends only Enter, without injecting another prompt.

The Cockpit timeline records prompt injection, automatic submission, fallback generation, cooldown skips, process exits, and control-mode changes.

## Terminal Copy

To copy terminal content:

- Select text in the terminal, then click `Copy` in the terminal header.
- Use `Ctrl+Shift+C` to copy the current terminal selection.
- If nothing is selected, the `Copy` button copies the current saved terminal output tail.

## Prompt Presets

Use `Prompt Composer` in the selected session control area to assemble reusable instructions.

- `Task input`: write the real task once.
- `Short`: common operator prompts such as continue, inspect, recover, summarize, and finish.
- `Roles`: professional role prompts such as Python architect, frontend architect, Electron architect, and reliability architect.
- `Tasks`: reusable protocols for feature work, bug fixes, refactors, code review, and tests.
- `Agents`: prompts for CLIs that support subagent-style planning or worker delegation.

Selecting a preset fills `Prompt to inject`. It does not inject automatically.

The composer gives four actions:

- `Send text`: sends the prompt body itself to the terminal. Use this for short prompts such as `continue` or `我的运营待办`.
- file icon: writes the prompt to `.continuous/prompts/*.md` and injects a short read-this-file instruction. Use this for long role or architecture prompts.
- copy icon: copies the prompt body to the clipboard.
- Enter icon: sends only Enter without injecting another prompt.

The `Session` tab's quick `继续` action is also a direct text send. It does not create a prompt file and does not inject a `Please read ...` instruction.

## Session Export

Use `Export` in the Cockpit panel to create a local audit bundle. The export includes:

- session metadata
- timeline events
- terminal output tail
- full transcript when available
- watchdog policy
- last recovery suggestion when available

Exports are written under Electron app data:

```text
<Electron userData>/continuous/exports/
```

## Autopilot Policy

The Cockpit panel shows the current Autopilot policy: soft stall, hard stall, injection cooldown, regex markers, recovery routing, and circuit-breaker settings.

The policy file lives at:

```text
<Electron userData>/continuous/policies/default.json
```

It controls done markers, waiting patterns, blocked patterns, manual-stop patterns, timeouts, output-tail size, injection cooldown, and state-to-action recovery rules.

Use `Autopilot policy` in the Cockpit panel to edit the policy. Invalid regular expressions and invalid recovery rules are shown before saving. `Reset` restores defaults.

The default recovery routing is:

- waiting or soft stall: inject a local continue prompt, then escalate after retries.
- blocked or hard stall: ask Claude/Gemini fallback to generate a recovery prompt, then inject it.
- exited: restart the shell and send the inferred resume command, such as `codex resume --last` or `claude -c`.
- manual intervention: stop Autopilot and return control to the user.

The circuit breaker stops repeated recovery loops and switches the session back to Manual mode.

Use Operations to export or import policy JSON. This is useful when you have a stable watchdog policy for one machine or project family and want to reuse it elsewhere.

## Transcript Viewer

Use `Transcript` in the selected session area to load the session transcript, search it, jump between matches, and page through a bounded line window.

Timeline rows seed the transcript search field. Load the transcript after selecting an event to inspect nearby matching output.

## Session Diagnostics

Use `Session diagnostics` to inspect backend status. `tmux detached` sessions show whether the tmux session is alive, attached clients, pane count, the latest captured line, and recent pane capture.

## Operations

Use `Operations` for app-level maintenance:

- export/import/reset CLI presets
- export/import watchdog policy
- archive ended sessions into audit bundles
- clear ended sessions from the active list

Archive before clearing if you need later audit evidence.

## Optional Supervisor Files

The app can optionally ask the CLI to use project-local supervisor files:

```text
.agent-supervisor/PROGRESS.md
.agent-supervisor/HEARTBEAT.txt
.agent-supervisor/BLOCKED.flag
.agent-supervisor/DONE.flag
```

This protocol is optional. It is useful for long-running repair, benchmark, or data-processing tasks, but it is not required for normal CLI use.

## Cockpit Layout

The right Cockpit panel is split by task:

- `Session`: current status, prompt composer, and quick actions.
- `Launch`: runtime health and new CLI launch form.
- `Auto`: control mode, Autopilot pipeline, policy summary, and advanced policy editor.
- `Logs`: diagnostics, transcript, timeline, exports, and maintenance operations.

Use the app from left to right:

1. Sidebar: choose the active session.
2. Tabs: switch or close live sessions.
3. Terminal: interact with the real CLI.
4. Cockpit panel: use `Session` for day-to-day prompting, `Launch` for new CLIs, `Auto` for automation, and `Logs` for troubleshooting.

The terminal is the primary surface. The Cockpit panel is for control and audit, not for replacing the CLI.
