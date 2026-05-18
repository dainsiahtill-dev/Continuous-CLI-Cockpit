import { describe, expect, it } from 'vitest'
import { classifyWatchdogOutput, compilePatternList, type WatchdogClassifierPolicy } from './watchdogClassifier'

const policy: WatchdogClassifierPolicy = {
  blockedPatterns: compilePatternList(['failed', 'error:']),
  doneMarkers: ['BENCHMARK_DONE', 'DONE.flag'],
  manualInterventionEnabled: true,
  manualInterventionPatterns: compilePatternList(['password:', 'enter api key']),
  waitingPatterns: compilePatternList(['continue\\?', 'press enter']),
}

function classify(output: string) {
  return classifyWatchdogOutput({
    doneFlagMatches: [],
    output,
    policy,
  })
}

describe('watchdog terminal classifier', () => {
  it('treats a live Codex working indicator as active work', () => {
    const decision = classify('• Working (12m 39s • esc to interrupt)')

    expect(decision.kind).toBe('active')
    expect(decision.status).toBe('running')
  })

  it('does not treat the Codex bottom prompt as ready while work is active', () => {
    const decision = classify(
      [
        '• Working (3m 21s • esc to interrupt)',
        '',
        '• Messages to be submitted after next tool call (press esc to interrupt and send immediately)',
        '  ↳ **深度思考**并全量继续',
        '',
        'gpt-5.5 xhigh · ~\\Documents\\GitLab\\vector-pilot',
      ].join('\n'),
    )

    expect(decision.kind).toBe('active')
    expect(decision.status).toBe('running')
  })

  it('keeps active work dominant even when a prompt row is rendered below it', () => {
    const decision = classify(
      ['• Working (7m 47s • esc to interrupt)', 'gpt-5.5 xhigh · ~\\Documents\\GitLab\\vector-pilot'].join('\n'),
    )

    expect(decision.kind).toBe('active')
    expect(decision.status).toBe('running')
  })

  it('lets a newer Codex prompt override stale MCP startup activity', () => {
    const decision = classify(
      [
        '• Starting MCP servers (0/2): codex_apps, ida (0s • esc to interrupt)',
        '',
        'gpt-5.5 xhigh · ~\\Documents\\GitLab\\vector-pilot',
      ].join('\n'),
    )

    expect(decision.kind).toBe('ready')
    expect(decision.status).toBe('waiting')
  })

  it('does not let a prompt erase an earlier terminal error that still needs recovery', () => {
    const decision = classify(
      [
        '• Working (7m 47s • esc to interrupt)',
        'Codex ran out of room in the model context window. Start a new thread or clear earlier history.',
        'gpt-5.5 xhigh · ~\\Documents\\GitLab\\vector-pilot',
      ].join('\n'),
    )

    expect(decision.kind).toBe('context_exhausted')
    expect(decision.status).toBe('blocked')
  })

  it('prefers a newer blocked signal over an older active marker', () => {
    const decision = classify(['• Working (1m • esc to interrupt)', 'error: build failed'].join('\n'))

    expect(decision.kind).toBe('blocked')
    expect(decision.status).toBe('blocked')
  })

  it('does not mark DONE.flag text as completion unless the flag exists', () => {
    const decision = classify('If complete, write .agent-supervisor/DONE.flag and print BENCHMARK_DONE later.')

    expect(decision.kind).toBe('none')
  })

  it('marks exact done output lines as completion', () => {
    const decision = classify('work finished\nBENCHMARK_DONE\n')

    expect(decision.kind).toBe('done')
  })

  it('marks real done flags as completion', () => {
    const decision = classifyWatchdogOutput({
      doneFlagMatches: [{ marker: 'DONE.flag', path: 'C:\\repo\\.agent-supervisor\\DONE.flag' }],
      output: 'ordinary terminal output',
      policy,
    })

    expect(decision.kind).toBe('done')
    expect(decision.reason).toContain('DONE.flag')
  })
})
