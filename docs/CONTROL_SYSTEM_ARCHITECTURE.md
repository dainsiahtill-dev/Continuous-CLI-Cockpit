# Control System Architecture

Continuous CLI Cockpit is best understood as a cybernetic control system around real CLI processes.

The primary CLI and its project are the controlled system. The cockpit is an observer, recorder, and optional controller. The human operator remains the supervisory controller.

## System Model

```text
Human operator
  -> sets task, mode, policy, and stop conditions
  -> can interrupt at any time

Cockpit controller
  -> observes terminal output, time, process state, prompt files, and tmux diagnostics
  -> estimates session state through the watchdog classifier
  -> chooses an allowed policy action
  -> injects the smallest useful intervention
  -> records every action and outcome

Controlled system
  -> primary CLI process
  -> working directory and project files
  -> shell, tmux, WSL, network, and local runtime
```

The invariant is unchanged: the primary CLI remains the only executor. Fallback CLIs only generate recovery prompts for the primary CLI.

## Cybernetic Roles

| Role                   | Implementation                                                 | Responsibility                                                                                      |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Plant                  | Primary CLI, shell, project, tmux session                      | Performs the real work and produces terminal output.                                                |
| Sensor                 | PTY stream, tmux capture, transcript, events, screen snapshots | Captures signals without changing the plant.                                                        |
| State estimator        | Watchdog classifier                                            | Converts noisy signals into states such as waiting, blocked, stalled, done, or manual intervention. |
| Controller             | Recovery policy router                                         | Chooses an allowed action for the estimated state.                                                  |
| Actuator               | Prompt injection, Enter submission, tmux paste, mode change    | Applies interventions back into the same CLI session.                                               |
| Supervisory controller | Human operator, Manual mode, circuit breaker                   | Limits automation and takes over when uncertainty or risk is high.                                  |
| Memory                 | Sessions, transcripts, events, prompt files, policies, exports | Preserves evidence for audit, replay, and policy improvement.                                       |

## Feedback Loop

The loop is deliberately conservative:

```text
Observe
  -> Estimate
  -> Decide
  -> Act
  -> Verify
  -> Record
  -> Adjust policy only through explicit operator action
```

### Observe

The cockpit collects terminal bytes, recent screen text, output timestamps, process exits, tmux liveness, prompt-file paths, and timeline events.

Signals are treated as noisy. A regex match is evidence, not truth. Idle time is a weak signal until it crosses policy thresholds.

### Estimate

The watchdog maps observations into operational states:

- running
- waiting
- stalled
- blocked
- recovering
- done
- detached
- exited
- manual intervention

The estimator must stay explainable. Every classification has a reason string that appears in the UI and session timeline.

### Decide

Recovery rules are bounded control laws:

```text
state + retry history + cooldown + circuit breaker -> allowed action
```

Policy is stored as data, not hidden code, so operators can inspect, export, import, and reset it.

Project-scoped policies let different repositories keep different prompt templates, markers, thresholds, and recovery behavior. Session-scoped copy-on-write overrides let one tab run an experiment without changing the project controller. The cascade is:

```text
default policy <- project policy by cwd <- session override by session id
```

An override becomes project behavior only after the operator explicitly promotes it.

### Act

Actions must be minimal and auditable:

- inject a local continue prompt
- call a fallback prompt generator, then inject its result
- send a resume command when that path is enabled
- interrupt automation and return to Manual mode

Long prompts are written to `.continuous/prompts/*.md`; the terminal receives a short read-this-file instruction. This makes intervention content reviewable and avoids unstable large pastes.

### Verify

After an action, the next observations determine whether the plant resumed, stalled again, exited, or entered a higher-risk state. Cooldowns and retry limits prevent rapid repeated actuation.

### Record

Every loop iteration that changes state or acts on the plant must leave evidence:

- session snapshot
- timeline event
- transcript bytes
- prompt file path when applicable
- export bundle when requested

## Scientific Method Layer

The scientific method turns policy tuning from guesswork into explicit experiments.

| Scientific step | Cockpit equivalent                                                                          |
| --------------- | ------------------------------------------------------------------------------------------- |
| Observation     | Transcript, terminal tail, timeline, diagnostics.                                           |
| Question        | Why is the CLI waiting, stalled, blocked, or looping?                                       |
| Hypothesis      | A recovery rule or prompt template should move the CLI toward completion.                   |
| Prediction      | After intervention, the CLI should produce new output, complete, or expose a smaller error. |
| Experiment      | Run the policy in Assisted or Autopilot mode on a real session.                             |
| Measurement     | Status transition, retry count, cooldown, transcript delta, event sequence.                 |
| Falsification   | Repeated blocked states, circuit breaker, manual intervention, or no new useful output.     |
| Revision        | Operator edits the project policy or prompt template.                                       |
| Replication     | Export policy/session evidence and run on similar projects.                                 |

Each recovery rule should be treated as a hypothesis:

```text
When state X is detected under context Y,
prompt/action Z will increase progress without increasing risk.
```

If evidence contradicts the rule, the rule should be narrowed, disabled, or moved behind a safer action.

## Stability Rules

The system favors stability over speed.

- Manual mode is the safe baseline.
- Assisted mode keeps the human in the decision loop.
- Autopilot is an explicit closed-loop controller.
- Manual-intervention matches always stop Autopilot.
- Circuit breakers stop repeated recovery loops.
- Cooldowns prevent high-frequency prompting.
- Retry limits prevent unbounded action escalation.
- Terminal output tails are bounded.
- PTY processes are not assumed to survive app restart.
- tmux sessions are treated as live only after diagnostics confirm liveness.

## Observability Requirements

For every automatic action, the operator must be able to answer:

- What did the cockpit observe?
- What state did it infer?
- Which rule fired?
- What prompt or command was injected?
- When did it happen?
- What happened afterward?
- How can I export the evidence?

The UI surfaces this through status reasons, the Autopilot pipeline, session events, transcript search, diagnostics, and session export bundles.

## Policy Design Principles

Good policies are narrow, testable, and reversible.

- Use specific done markers for known workflows.
- Prefer waiting patterns that identify real CLI prompts.
- Keep blocked patterns broad enough to detect failure, but not so broad that normal progress is classified as failure.
- Put secrets, login, captcha, billing, and 2FA into manual-intervention patterns.
- Keep local continue prompts short.
- Use fallback generation when the output contains enough evidence to generate a useful next prompt.
- Use project policies when a repository has unique commands, task protocol files, done markers, or recovery language.
- Use session overrides when testing a new recovery template, threshold, or routing choice for one task.
- Promote a session override to the project only after its evidence supports reuse.

## Architecture Boundaries

The cockpit must not silently become an autonomous agent runtime.

- No project command execution by fallback agents.
- No silent policy mutation by Autopilot.
- No hidden prompt injection.
- No renderer access to Node primitives.
- No unvalidated IPC payloads.
- No unbounded transcript or event growth in React state.

## Verification Strategy

The testing ladder should match control-system risk.

1. Unit tests for classifiers, policy normalization, prompt rendering, and domain helpers.
2. Replay tests that feed saved transcript snippets through the watchdog and assert classifications.
3. Policy simulation tests that verify rule routing, retry limits, cooldown, and circuit breaker behavior.
4. IPC contract tests for malformed payloads.
5. Runner integration tests for PTY launch, prompt-file injection, tmux unavailable, and tmux reattach.
6. Production smoke tests outside the Vite dev server.

## Improvement Roadmap

1. Add replay fixtures from exported sessions.
2. Store event-to-transcript byte offsets for exact audit jumps.
3. Track post-intervention outcome metrics.
4. Add a policy experiment log that records hypothesis, expected signal, result, and conclusion.
5. Add retention controls for transcripts, exports, prompt files, and archives.
6. Add packaged-app icon and installer metadata once a packaging tool is selected.

This keeps the system scientific: every automation rule is observable, testable, falsifiable, and revisable.
