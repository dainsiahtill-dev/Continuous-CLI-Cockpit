# Recovery Policy

Autopilot is policy-driven. The terminal watchdog only observes and classifies; the recovery policy decides what action is allowed.

Treat each recovery rule as a scientific hypothesis:

```text
When this terminal state is observed in this project context,
this bounded action should increase progress without increasing risk.
```

If evidence contradicts the hypothesis, narrow the rule, disable it, or move it behind a safer action.

## Decision Flow

```text
terminal output / process state
  -> watchdog classifier
       waiting | soft_stall | hard_stall | blocked | exited | manual_intervention
  -> default or project policy lookup
  -> recovery rule routing
       inject_local_prompt | trigger_fallback_agent | auto_resume | interrupt
  -> circuit breaker
  -> audited action
```

## Policy Scope

The default policy is stored at:

```text
<Electron userData>/continuous/policies/default.json
```

Project policies are stored at:

```text
<Electron userData>/continuous/policies/projects.json
```

When a session has an active working directory, the Cockpit resolves policy through this cascade:

```text
default policy <- project policy by cwd <- session override by session id
```

Normal edits in an active session create a session override. This is copy-on-write behavior: the session starts synchronized with the project policy, but the first edit becomes local to that session. `Save to project` promotes the session draft to the project policy and clears the session override. `Reload project` discards the session override and returns to the project policy. If no project policy exists, the session uses the default policy.

## Default Routing

- `manual_intervention`: interrupt Autopilot for login, secrets, billing, captcha, and similar human-only states.
- `exited`: restart the shell and send the inferred resume command, such as `codex resume --last` or `claude -c`.
- `blocked`: ask the fallback agent to generate a recovery prompt, then inject that prompt back into the primary CLI.
- `hard_stall`: same as blocked, because long silence is treated as a stronger failure signal.
- `waiting`: inject a local continue prompt first, then escalate to fallback after rule retries are exhausted.
- `soft_stall`: inject a local continue prompt first, then escalate to fallback after rule retries are exhausted.

The primary CLI remains the only executor. Fallback agents only generate text for the primary CLI to read.

## Prompt Templates

Rule prompts support these placeholders:

```text
{{title}}
{{cwd}}
{{command}}
{{status}}
{{reason}}
```

Prompts are written into:

```text
<working directory>/.continuous/prompts/
```

The terminal receives only a short instruction to read that file.

## Circuit Breaker

The circuit breaker prevents infinite recovery loops. If too many policy actions happen inside the configured time window, Autopilot switches the session to Manual mode, disables the watchdog, and records an audit event.

Manual intervention patterns also stop Autopilot immediately. This protects states where automation should not guess, such as passwords, API keys, billing, login, captcha, or two-factor prompts.

## UI Strategy

The app uses UI-first policy configuration for the main path because it is easier to inspect, safer to validate, and cross-platform. A Python or script SDK can be added later as a plugin layer on top of this same state/action contract, but it should not replace the built-in policy engine.
