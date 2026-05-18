export type ClassifierRecoveryState = 'waiting' | 'blocked' | 'manual_intervention' | 'context_exhausted'

export type DoneFlagMatch = {
  marker: string
  path: string
}

export type WatchdogClassifierPolicy = {
  blockedPatterns: readonly RegExp[]
  doneMarkers: readonly string[]
  manualInterventionEnabled: boolean
  manualInterventionPatterns: readonly RegExp[]
  waitingPatterns: readonly RegExp[]
}

export type WatchdogDecision =
  | {
      kind: 'done'
      reason: string
      status: 'done'
    }
  | {
      kind: 'ready'
      reason: string
      recoveryState: 'waiting'
      status: 'waiting'
    }
  | {
      kind: 'active'
      reason: string
      status: 'running'
    }
  | {
      kind: 'manual_intervention'
      reason: string
      recoveryState: 'manual_intervention'
      status: 'blocked'
    }
  | {
      kind: 'context_exhausted'
      reason: string
      recoveryState: 'context_exhausted'
      status: 'blocked'
    }
  | {
      kind: 'blocked'
      reason: string
      recoveryState: 'blocked'
      status: 'blocked'
    }
  | {
      kind: 'waiting'
      reason: string
      recoveryState: 'waiting'
      status: 'waiting'
    }
  | {
      kind: 'none'
      reason: string
      status: 'running'
    }

type TerminalSignalKind = 'ready' | 'active' | 'manual_intervention' | 'context_exhausted' | 'blocked' | 'waiting'

type TerminalSignal = {
  index: number
  kind: TerminalSignalKind
  text: string
}

const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')

const activeWorkPatterns = [
  /\bworking\s*\([^)]*\besc\s+to\s+interrupt\b[^)]*\)/i,
  /\bworking\s*\([^)]*\)/i,
  /\bmessages?\s+to\s+be\s+submitted\s+after\s+next\s+tool\s+call\b/i,
  /\bpress\s+esc\s+to\s+interrupt\s+and\s+send\s+immediately\b/i,
  /\b(ctrl-c|control-c)\s+to\s+(cancel|interrupt|stop)\b/i,
  /\b(thinking|processing|executing|running)\b.{0,80}\b(interrupt|cancel|stop)\b/i,
  /\bthinking\b/i,
] as const

const startupActivityPatterns = [/\bstarting\s+mcp\s+servers\s*\([^)]*\besc\s+to\s+interrupt\b[^)]*\)/i] as const

const readyPromptPatterns = [
  /(?:^|\n)\s*(?:gpt|o\d|codex)[\w.-]*(?:\s+[A-Za-z0-9._-]+){0,4}\s*[\u00b7\u2022]\s*(?:~|[A-Za-z]:\\|\/)[^\n]*$/im,
  /(?:^|\n)\s*(?:gpt|o\d|codex)[\w.-]*[^\n]{0,120}(?:~|[A-Za-z]:\\|\/)[^\n]*$/im,
] as const

const contextExhaustedPatterns = [
  /codex\s+ran\s+out\s+of\s+room/i,
  /ran\s+out\s+of\s+room\s+in\s+the\s+model'?s\s+context\s+window/i,
  /model'?s\s+context\s+window/i,
  /maximum\s+context\s+(length|window)/i,
  /context\s+(length|window)\s+(exceeded|full|overflow)/i,
  /start\s+a\s+new\s+thread\s+or\s+clear\s+earlier\s+history/i,
] as const

/**
 * Compiles user-provided regex strings for the watchdog policy.
 */
export function compilePatternList(patterns: readonly string[]) {
  return patterns
    .map((pattern) => {
      try {
        return new RegExp(pattern, 'i')
      } catch {
        return null
      }
    })
    .filter((pattern): pattern is RegExp => pattern !== null)
}

export function stripAnsi(text: string) {
  return text.replace(ansiEscapePattern, '')
}

export function normalizeTerminalOutput(text: string, limit = 12_000) {
  return stripAnsi(text)
    .replace(/\r(?!\n)/g, '\n')
    .slice(-limit)
}

export function isDoneFlagMarker(marker: string) {
  const normalized = marker.trim().replaceAll('\\', '/')
  return normalized.endsWith('.flag')
}

export function classifyWatchdogOutput({
  doneFlagMatches,
  output,
  policy,
}: {
  doneFlagMatches: readonly DoneFlagMatch[]
  output: string
  policy: WatchdogClassifierPolicy
}): WatchdogDecision {
  const recent = normalizeTerminalOutput(output)
  const doneReason = detectDoneMarker(recent, policy.doneMarkers, doneFlagMatches)
  if (doneReason) {
    return { kind: 'done', reason: doneReason, status: 'done' }
  }

  const interaction = focusInteractionRegion(recent)
  const active = latestPatternSignal(interaction, activeWorkPatterns, 'active')
  const startupActivity = latestPatternSignal(interaction, startupActivityPatterns, 'active')
  const ready = latestPatternSignal(interaction, readyPromptPatterns, 'ready')
  const latestActivity = latestSignal(
    [active, startupActivity].filter((signal): signal is TerminalSignal => signal !== null),
  )
  const signals = [
    policy.manualInterventionEnabled
      ? latestPatternSignal(interaction, policy.manualInterventionPatterns, 'manual_intervention')
      : null,
    latestPatternSignal(interaction, contextExhaustedPatterns, 'context_exhausted'),
    latestPatternSignal(interaction, policy.blockedPatterns, 'blocked'),
    latestPatternSignal(interaction, policy.waitingPatterns, 'waiting'),
  ].filter((signal): signal is TerminalSignal => signal !== null)

  const latestRecoverySignal = latestSignal(signals)

  if (latestRecoverySignal && (!latestActivity || latestRecoverySignal.index > latestActivity.index)) {
    return decisionFromRecoverySignal(interaction, latestRecoverySignal)
  }

  if (active) {
    return {
      kind: 'active',
      reason: `CLI reports active work: ${signalLine(interaction, active)}`,
      status: 'running',
    }
  }

  if (ready && (!startupActivity || ready.index > startupActivity.index)) {
    return {
      kind: 'ready',
      reason: `CLI prompt ready: ${signalLine(interaction, ready)}`,
      recoveryState: 'waiting',
      status: 'waiting',
    }
  }

  if (startupActivity) {
    return {
      kind: 'active',
      reason: `CLI reports active work: ${signalLine(interaction, startupActivity)}`,
      status: 'running',
    }
  }

  return {
    kind: 'none',
    reason: 'watchdog observing',
    status: 'running',
  }
}

function detectDoneMarker(text: string, doneMarkers: readonly string[], doneFlagMatches: readonly DoneFlagMatch[]) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const marker of doneMarkers) {
    const trimmed = marker.trim()
    if (!trimmed) continue

    if (isDoneFlagMarker(trimmed)) {
      const matched = doneFlagMatches.find((item) => item.marker === trimmed)
      if (matched) return `done flag exists: ${matched.path}`
      continue
    }

    if (lines.some((line) => line === trimmed)) return `done marker output: ${trimmed}`
  }

  return null
}

function focusInteractionRegion(text: string, maxLines = 80) {
  const lines = text.split(/\r?\n/)
  return lines.slice(Math.max(0, lines.length - maxLines)).join('\n')
}

function decisionFromRecoverySignal(text: string, signal: TerminalSignal): WatchdogDecision {
  const line = signalLine(text, signal)

  if (signal.kind === 'manual_intervention') {
    return {
      kind: 'manual_intervention',
      reason: `manual intervention pattern detected: ${line}`,
      recoveryState: 'manual_intervention',
      status: 'blocked',
    }
  }

  if (signal.kind === 'context_exhausted') {
    return {
      kind: 'context_exhausted',
      reason: `context window exhausted: ${line}`,
      recoveryState: 'context_exhausted',
      status: 'blocked',
    }
  }

  if (signal.kind === 'blocked') {
    return {
      kind: 'blocked',
      reason: `blocked pattern detected: ${line}`,
      recoveryState: 'blocked',
      status: 'blocked',
    }
  }

  return {
    kind: 'waiting',
    reason: `waiting pattern detected: ${line}`,
    recoveryState: 'waiting',
    status: 'waiting',
  }
}

function latestSignal(signals: readonly TerminalSignal[]) {
  return signals.reduce<TerminalSignal | null>((latest, signal) => {
    if (!latest || signal.index >= latest.index) return signal
    return latest
  }, null)
}

function regexWithGlobal(pattern: RegExp) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

function latestPatternSignal(
  text: string,
  patterns: readonly RegExp[],
  kind: TerminalSignalKind,
): TerminalSignal | null {
  let latest: TerminalSignal | null = null

  patterns.forEach((pattern) => {
    const regex = regexWithGlobal(pattern)
    let match: RegExpExecArray | null = regex.exec(text)

    while (match) {
      if (!latest || match.index >= latest.index) {
        latest = {
          index: match.index,
          kind,
          text: match[0].trim() || pattern.source,
        }
      }
      if (match[0].length === 0) regex.lastIndex += 1
      match = regex.exec(text)
    }
  })

  return latest
}

function signalLine(text: string, signal: TerminalSignal) {
  const before = text.lastIndexOf('\n', signal.index)
  const after = text.indexOf('\n', signal.index)
  const start = before === -1 ? 0 : before + 1
  const end = after === -1 ? text.length : after
  return text.slice(start, end).trim().slice(0, 180) || signal.text.slice(0, 180)
}
