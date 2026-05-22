import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CliSessionSnapshot, WatchdogPolicy } from '../types/electron'
import { AutopilotPipeline } from './AutopilotPipeline'

const policy: WatchdogPolicy = {
  version: 1,
  checkIntervalMs: 10_000,
  softStallMs: 300_000,
  hardStallMs: 900_000,
  injectCooldownMs: 120_000,
  maxLocalContinueRetry: 2,
  outputTailLimit: 100_000,
  doneMarkers: ['DONE'],
  waitingPatterns: ['continue'],
  blockedPatterns: ['error'],
  recoveryRules: [
    {
      id: 'waiting-continue',
      label: 'Waiting continue',
      state: 'waiting',
      action: 'inject_local_prompt',
      enabled: true,
      priority: 100,
      maxRetries: 2,
      prompt: 'Continue.',
      resumeCommand: '',
    },
  ],
  circuitBreaker: {
    enabled: true,
    windowMs: 600_000,
    maxRecoveries: 3,
    manualInterventionPatterns: ['password:'],
  },
}

function makeSession(patch: Partial<CliSessionSnapshot> = {}): CliSessionSnapshot {
  const now = 1_000_000
  return {
    id: 'session-1',
    preset: 'codex',
    title: 'Codex',
    cwd: 'C:\\repo',
    command: 'codex',
    shellKind: 'powershell',
    runnerBackend: 'pty',
    runMode: 'autopilot',
    supervisorProtocol: false,
    watchdogEnabled: true,
    status: 'running',
    statusReason: 'watchdog observing',
    createdAt: now,
    startedAt: now,
    lastOutputAt: now,
    lastInjectAt: 0,
    localRetry: 0,
    fallbackRetry: 0,
    totalRecoveries: 0,
    outputTail: '',
    transcriptPath: 'C:\\transcripts\\session.log',
    lastSuggestedPrompt: '',
    hasSessionPolicyOverride: false,
    events: [],
    attached: true,
    ...patch,
  }
}

describe('AutopilotPipeline', () => {
  it('shows observing state for healthy autopilot sessions', () => {
    render(
      <AutopilotPipeline cooldown={0} now={1_001_000} policy={policy} session={makeSession()} onInterrupt={vi.fn()} />,
    )

    expect(screen.getByText('Observing terminal')).toBeInTheDocument()
    expect(screen.getByText(/Watchdog checks every 10s/i)).toBeInTheDocument()
  })

  it('shows evaluation reason for blocked sessions', () => {
    render(
      <AutopilotPipeline
        cooldown={0}
        now={1_001_000}
        policy={policy}
        session={makeSession({ status: 'blocked', statusReason: 'blocked pattern detected' })}
        onInterrupt={vi.fn()}
      />,
    )

    expect(screen.getByText('Evaluating terminal state')).toBeInTheDocument()
    expect(screen.getByText('blocked pattern detected')).toBeInTheDocument()
  })

  it('lets the operator interrupt autopilot', () => {
    const onInterrupt = vi.fn()
    render(
      <AutopilotPipeline
        cooldown={0}
        now={1_001_000}
        policy={policy}
        session={makeSession()}
        onInterrupt={onInterrupt}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /interrupt/i }))

    expect(onInterrupt).toHaveBeenCalledOnce()
  })
})
