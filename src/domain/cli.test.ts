import { describe, expect, it } from 'vitest'
import { defaultSupervisorPrompt, formatDuration, parseRunnerBackend, parseShellKind, upsertSession } from './cli'
import type { CliSessionSnapshot } from '../types/electron'

function makeSession(id: string, title: string): CliSessionSnapshot {
  const now = 1_000
  return {
    id,
    preset: 'codex',
    title,
    cwd: 'C:\\work',
    command: 'codex',
    shellKind: 'powershell',
    runnerBackend: 'pty',
    runMode: 'manual',
    supervisorProtocol: false,
    watchdogEnabled: false,
    status: 'running',
    statusReason: 'test',
    createdAt: now,
    startedAt: now,
    lastOutputAt: now,
    lastInjectAt: 0,
    localRetry: 0,
    fallbackRetry: 0,
    totalRecoveries: 0,
    outputTail: '',
    transcriptPath: 'C:\\transcripts\\one.log',
    lastSuggestedPrompt: '',
    events: [],
    attached: true,
  }
}

describe('cli domain helpers', () => {
  it('upserts sessions without duplicating existing ids', () => {
    const first = makeSession('one', 'First')
    const updated = makeSession('one', 'Updated')
    const second = makeSession('two', 'Second')

    expect(upsertSession([], first)).toEqual([first])
    expect(upsertSession([first], updated)).toEqual([updated])
    expect(upsertSession([first], second)).toEqual([first, second])
  })

  it('formats elapsed time for compact cockpit metrics', () => {
    expect(formatDuration(-1)).toBe('0s')
    expect(formatDuration(9_000)).toBe('9s')
    expect(formatDuration(65_000)).toBe('1m 5s')
    expect(formatDuration(3_700_000)).toBe('1h 1m')
  })

  it('falls back to safe enum defaults for untrusted select values', () => {
    expect(parseShellKind('wsl')).toBe('wsl')
    expect(parseShellKind('bad-value')).toBe('default')
    expect(parseRunnerBackend('tmux')).toBe('tmux')
    expect(parseRunnerBackend('bad-value')).toBe('pty')
  })

  it('builds an optional supervisor prompt without forcing a project-specific workflow', () => {
    const prompt = defaultSupervisorPrompt('C:\\repo')

    expect(prompt).toContain('C:\\repo')
    expect(prompt).toContain('.agent-supervisor/PROGRESS.md')
    expect(prompt).toContain('BENCHMARK_DONE')
  })
})
