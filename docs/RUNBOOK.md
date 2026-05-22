# Operations Runbook

This runbook covers local setup, tmux readiness, persistence inspection, and common failure cases.

## Local Development

```bash
npm install
npm run dev
```

The dev server listens on:

```text
http://127.0.0.1:8438
```

`npm run dev` starts Vite and lets `vite-plugin-electron` launch a single Electron desktop window. Use the Electron window for shell control.

Use this only for renderer preview:

```bash
npm run dev:renderer
```

A normal browser tab can load the renderer, but it does not have the preload IPC bridge needed to control local shells. Seeing `Electron bridge unavailable` in the browser is expected.

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Expected result:

- typecheck exits with code 0
- tests pass
- lint exits with code 0
- build exits with code 0

Vite may warn about a large renderer chunk because xterm and icon libraries are bundled. That warning is not currently a functional failure.

Format check:

```bash
npm run format:check
```

## Windows tmux Setup

The `tmux detached` runner uses WSL on Windows.

Check tmux:

```bash
wsl.exe tmux -V
```

If tmux is missing:

```bash
wsl.exe
sudo apt update
sudo apt install -y tmux
tmux -V
```

After tmux is available, launch a session with:

- Runner backend: `tmux detached`
- Shell backend: `wsl` or `default`

The Cockpit panel has a runtime health section. Use `Refresh health` after installing WSL or tmux.

## Persistence Locations

Electron app data is platform-dependent.

On Windows it is typically:

```text
C:\Users\<user>\AppData\Roaming\continuous
```

Session state:

```text
<Electron userData>\continuous\sessions.json
```

Event log:

```text
<Electron userData>\continuous-events\events.jsonl
```

Prompt files:

```text
<working directory>\.continuous\prompts\
```

Full transcripts:

```text
<Electron userData>\continuous\transcripts\<session-id>.log
```

Watchdog policy:

```text
<Electron userData>\continuous\policies\default.json
```

Project-scoped watchdog policies:

```text
<Electron userData>\continuous\policies\projects.json
```

CLI presets:

```text
<Electron userData>\continuous\presets\default.json
```

Session export bundles:

```text
<Electron userData>\continuous\exports\
```

## Restore Behavior

On launch, the app reads `sessions.json`.

For `pty` sessions:

- terminal history is restored
- status becomes exited if the process was previously live
- the original PTY process is not recoverable

For `tmux` sessions:

- terminal history is restored
- the app checks whether the tmux session still exists
- if alive, it attempts to attach automatically
- if not alive, status becomes exited

## Reattach

If a tmux session is still alive but the UI is detached:

1. Select the session.
2. Click `Reattach`.
3. The terminal should reconnect to the tmux session.

Manual tmux check from WSL:

```bash
tmux ls
tmux attach -t <session-name>
```

## Common Issues

### `tmux: not found`

Install tmux inside WSL:

```bash
sudo apt update
sudo apt install -y tmux
```

### WSL path mismatch

The app converts Windows paths such as:

```text
C:\Users\dains\Documents\GitLab\continuous
```

to:

```text
/mnt/c/Users/dains/Documents/GitLab/continuous
```

for tmux startup.

If a path is not mounted in WSL, choose a directory that WSL can access.

### Prompt injection does not appear

Check:

- the session is attached
- the target CLI is accepting input
- the prompt file exists under `.continuous/prompts`
- the runner backend is still alive
- the injection cooldown has elapsed
- the session timeline does not show `recovery-skipped`

### Autopilot continues unexpectedly

Switch the session mode to Manual or turn off Watchdog in the Control section.

Inspect the policy file if the classification is too aggressive:

```text
<Electron userData>\continuous\policies\default.json
```

If only one project behaves incorrectly, inspect the project policy override:

```text
<Electron userData>\continuous\policies\projects.json
```

After editing policy files manually, restart the app so the main process reloads them.

You can also edit and save the policy directly from the Cockpit panel. With an active session, edits are saved as a session override first. Use `Save to project` only after the override should become shared project behavior. Invalid regex patterns are rejected before they reach the watchdog.

Use `Export policy` and `Import policy` in Operations to move a known-good policy between machines. Imported policies are validated before they are applied.

### Presets are wrong after import

Use `Reset presets` in Operations to restore the built-in Codex, Claude, Gemini, shell, WSL, and custom presets.

Imported preset files must contain every preset key and each preset must provide a label, command, shell kind, and title.

### Transcript search is empty

Check:

- the selected session has produced terminal output
- the transcript path exists under `<Electron userData>\continuous\transcripts\`
- click `Load` in the Transcript section after selecting the session
- timeline rows only seed the search field; the transcript still needs to be loaded on demand

### Session diagnostics show `n/a`

`pty` sessions do not have tmux diagnostics. For `tmux detached` sessions, click `Refresh` in Session diagnostics to check session existence, clients, panes, the latest captured line, and recent pane capture.

### Ended sessions clutter the sidebar

Use Operations:

- `Archive ended` writes audit bundles under `<Electron userData>\continuous\exports\archives\` and removes ended sessions from the active list.
- `Clear ended` removes ended sessions from the active list without writing archive bundles.

### Terminal-Icons PowerShell warnings

Some local PowerShell profiles may print `Terminal-Icons` warnings. These are unrelated to the app if lint/build still exit with code 0.
