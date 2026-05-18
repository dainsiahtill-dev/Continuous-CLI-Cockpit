import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLaunchForm } from './useLaunchForm'
import type { CliDefaults } from '../types/electron'

const defaults: CliDefaults = {
  cwd: 'C:\\repo',
  home: 'C:\\Users\\dains',
  runnerBackends: ['pty', 'tmux'],
  policy: {
    version: 1,
    checkIntervalMs: 10_000,
    softStallMs: 300_000,
    hardStallMs: 900_000,
    injectCooldownMs: 120_000,
    maxLocalContinueRetry: 2,
    outputTailLimit: 100_000,
    doneMarkers: ['BENCHMARK_DONE'],
    waitingPatterns: ['waiting for'],
    blockedPatterns: ['error:'],
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
  },
  presets: {
    codex: { label: 'Codex', command: 'codex', shellKind: 'powershell', title: 'Codex CLI' },
    'codex-resume': {
      label: 'Codex Resume',
      command: 'codex resume --last',
      shellKind: 'powershell',
      title: 'Codex Resume',
    },
    claude: { label: 'Claude', command: 'claude', shellKind: 'powershell', title: 'Claude CLI' },
    'claude-continue': {
      label: 'Claude Continue',
      command: 'claude -c',
      shellKind: 'powershell',
      title: 'Claude Continue',
    },
    gemini: { label: 'Gemini', command: 'gemini', shellKind: 'powershell', title: 'Gemini CLI' },
    shell: { label: 'Shell', command: '', shellKind: 'powershell', title: 'Local Shell' },
    wsl: { label: 'WSL', command: '', shellKind: 'wsl', title: 'WSL Shell' },
    custom: { label: 'Custom', command: '', shellKind: 'powershell', title: 'Custom CLI' },
  },
}

describe('useLaunchForm', () => {
  it('derives defaults from the selected preset and working directory', () => {
    const { result } = renderHook(() => useLaunchForm(defaults))

    expect(result.current.derived.cwd).toBe('C:\\repo')
    expect(result.current.derived.command).toBe('codex')
    expect(result.current.derived.title).toBe('Codex CLI')
    expect(result.current.toConfig()).toMatchObject({
      preset: 'codex',
      cwd: 'C:\\repo',
      command: 'codex',
      runMode: 'manual',
    })
  })

  it('keeps watchdog intent aligned with the selected run mode', () => {
    const { result } = renderHook(() => useLaunchForm(defaults))

    act(() => result.current.setRunMode('autopilot'))

    expect(result.current.state.runMode).toBe('autopilot')
    expect(result.current.state.watchdogEnabled).toBe(true)
  })

  it('switches preset-specific command, title, and shell without stale state', () => {
    const { result } = renderHook(() => useLaunchForm(defaults))

    act(() => result.current.setPreset('wsl'))

    expect(result.current.derived.title).toBe('WSL Shell')
    expect(result.current.derived.command).toBe('')
    expect(result.current.derived.shellKind).toBe('wsl')
  })
})
