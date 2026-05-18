import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pty from 'node-pty'
import {
  classifyWatchdogOutput,
  compilePatternList,
  isDoneFlagMarker,
  stripAnsi,
  type DoneFlagMatch,
  type WatchdogClassifierPolicy,
} from '../src/domain/watchdogClassifier'

type CliPreset = 'codex' | 'codex-resume' | 'claude' | 'claude-continue' | 'gemini' | 'shell' | 'wsl' | 'custom'

type ShellKind = 'default' | 'powershell' | 'cmd' | 'bash' | 'wsl'
type RunMode = 'manual' | 'assisted' | 'autopilot'
type RunnerBackend = 'pty' | 'tmux'
type CliStatus =
  | 'booting'
  | 'running'
  | 'waiting'
  | 'stalled'
  | 'blocked'
  | 'recovering'
  | 'done'
  | 'detached'
  | 'exited'

type CliPresetInfo = {
  label: string
  command: string
  shellKind: ShellKind
  title: string
}

type CliEvent = {
  id: string
  sessionId: string
  time: number
  type: string
  message: string
  detail?: string
}

type CliSessionConfig = {
  preset: CliPreset
  title?: string
  cwd?: string
  command?: string
  shellKind?: ShellKind
  runMode?: RunMode
  initialPrompt?: string
  injectInitialPrompt?: boolean
  watchdogEnabled?: boolean
  supervisorProtocol?: boolean
  runnerBackend?: RunnerBackend
  cols?: number
  rows?: number
}

type CliSession = {
  id: string
  preset: CliPreset
  title: string
  cwd: string
  command: string
  shellKind: ShellKind
  runnerBackend: RunnerBackend
  tmuxSessionName: string | undefined
  runMode: RunMode
  supervisorProtocol: boolean
  watchdogEnabled: boolean
  status: CliStatus
  statusReason: string
  createdAt: number
  startedAt: number
  lastOutputAt: number
  lastInjectAt: number
  localRetry: number
  fallbackRetry: number
  totalRecoveries: number
  outputTail: string
  screenText: string
  screenCapturedAt: number
  transcriptPath: string
  lastSuggestedPrompt: string
  events: CliEvent[]
  attached: boolean
  ruleRetryCounts: Record<string, number>
  ptyProcess: pty.IPty | undefined
  recoveryInFlight: boolean
}

type CliSnapshot = Omit<
  CliSession,
  'ptyProcess' | 'recoveryInFlight' | 'ruleRetryCounts' | 'screenText' | 'screenCapturedAt'
>

type RecoveryState = 'waiting' | 'soft_stall' | 'hard_stall' | 'blocked' | 'exited' | 'manual_intervention'
type RecoveryAction = 'inject_local_prompt' | 'trigger_fallback_agent' | 'auto_resume' | 'interrupt'
type PromptDelivery = 'direct' | 'file'

type RecoveryRule = {
  id: string
  label: string
  state: RecoveryState
  action: RecoveryAction
  enabled: boolean
  priority: number
  maxRetries: number
  prompt: string
  resumeCommand: string
}

type CircuitBreakerPolicy = {
  enabled: boolean
  windowMs: number
  maxRecoveries: number
  manualInterventionPatterns: string[]
}

type WatchdogPolicy = {
  version: 1
  checkIntervalMs: number
  softStallMs: number
  hardStallMs: number
  injectCooldownMs: number
  maxLocalContinueRetry: number
  outputTailLimit: number
  doneMarkers: string[]
  waitingPatterns: string[]
  blockedPatterns: string[]
  recoveryRules: RecoveryRule[]
  circuitBreaker: CircuitBreakerPolicy
}

type SessionExportResult = {
  path: string
}

type RuntimeHealthItem = {
  available: boolean
  command: string
  detail: string
}

type RuntimeHealth = {
  checkedAt: number
  platform: string
  tmux: RuntimeHealthItem
  wsl: RuntimeHealthItem | null
}

type PolicySaveResult = { ok: true; policy: WatchdogPolicy } | { ok: false; errors: string[] }

type TranscriptReadResult = {
  path: string
  text: string
  truncated: boolean
  size: number
}

type SessionDiagnostics = {
  checkedAt: number
  runnerBackend: RunnerBackend
  attached: boolean
  tmuxSessionName: string | null
  tmuxAlive: boolean | null
  tmuxAttachedClients: number | null
  tmuxPaneCount: number | null
  tmuxLastLine: string
  tmuxCaptureTail: string
  detail: string
}

type ConfigFileResult = {
  path: string
}

type PresetSaveResult = { ok: true; presets: Record<CliPreset, CliPresetInfo> } | { ok: false; errors: string[] }

type SessionMaintenanceResult = {
  count: number
  path?: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const windowSize = { width: 1480, height: 920 }
const sessions = new Map<string, CliSession>()
const stoppingSessionIds = new Set<string>()
let mainWindow: BrowserWindow | null = null
let persistTimer: NodeJS.Timeout | null = null
const singleInstanceLock = app.requestSingleInstanceLock()

const MAX_EVENTS = 200
const MAX_TITLE_CHARS = 160
const MAX_PATH_CHARS = 2_000
const MAX_COMMAND_CHARS = 20_000
const MAX_PROMPT_CHARS = 200_000
const MAX_TERMINAL_INPUT_CHARS = 50_000
const MAX_SCREEN_SNAPSHOT_CHARS = 80_000
const MAX_TRANSCRIPT_READ_CHARS = 500_000
const SCREEN_SNAPSHOT_STALE_MS = 30_000
const TERMINAL_SUBMIT_DELAY_MS = 350
const TERMINAL_SUBMIT_FALLBACK_DELAY_MS = 800
const TERMINAL_SUBMIT_FINAL_DELAY_MS = 1_400

const cliPresetValues: readonly CliPreset[] = [
  'codex',
  'codex-resume',
  'claude',
  'claude-continue',
  'gemini',
  'shell',
  'wsl',
  'custom',
]
const shellKindValues: readonly ShellKind[] = ['default', 'powershell', 'cmd', 'bash', 'wsl']
const runModeValues: readonly RunMode[] = ['manual', 'assisted', 'autopilot']
const runnerBackendValues: readonly RunnerBackend[] = ['pty', 'tmux']
const promptDeliveryValues: readonly PromptDelivery[] = ['direct', 'file']
const recoveryStateValues: readonly RecoveryState[] = [
  'waiting',
  'soft_stall',
  'hard_stall',
  'blocked',
  'exited',
  'manual_intervention',
]
const recoveryActionValues: readonly RecoveryAction[] = [
  'inject_local_prompt',
  'trigger_fallback_agent',
  'auto_resume',
  'interrupt',
]

const defaultContinuePrompt = [
  'You are being continued by Continuous Autopilot.',
  'Reason: {{reason}}',
  'Working directory: {{cwd}}',
  'Command: {{command}}',
  '',
  'Do not start over. Continue from the current terminal context.',
  'If a conservative decision is possible, make it and continue.',
  'If the task is already complete, state that clearly and stop cleanly.',
  'If you cannot continue, write a concise blocked summary in the terminal.',
].join('\n')

const defaultFallbackInstruction = [
  'Generate a recovery prompt that makes the primary CLI continue from the current context.',
  'Prefer the smallest diagnostic or fix. Do not ask the user to perform manual steps.',
].join('\n')

const defaultExitPrompt = [
  'The previous CLI process exited before the task was clearly complete.',
  'Resume the latest available session if supported, read the recent context, and continue from the last safe point.',
].join('\n')

const defaultWatchdogPolicy: WatchdogPolicy = {
  version: 1,
  checkIntervalMs: 10_000,
  softStallMs: 5 * 60_000,
  hardStallMs: 15 * 60_000,
  injectCooldownMs: 120_000,
  maxLocalContinueRetry: 2,
  outputTailLimit: 100_000,
  doneMarkers: ['BENCHMARK_DONE', 'DONE.flag', 'TASK_DONE', 'ALL_DONE'],
  waitingPatterns: [
    'waiting for',
    'press enter',
    'continue\\?',
    'what would you like',
    'how do you want to proceed',
    'do you want to continue',
    'waiting for input',
  ],
  blockedPatterns: [
    'blocked',
    'stuck',
    'fatal',
    'traceback',
    'exception',
    'permission denied',
    'authentication',
    'rate limit',
    'api error',
    'network error',
    'timeout',
    'cannot continue',
    'failed',
    'error:',
  ],
  recoveryRules: [
    {
      id: 'manual-intervention-stop',
      label: 'Stop for login, secrets, or payment',
      state: 'manual_intervention',
      action: 'interrupt',
      enabled: true,
      priority: 1000,
      maxRetries: 1,
      prompt: '',
      resumeCommand: '',
    },
    {
      id: 'exited-auto-resume',
      label: 'Auto resume exited CLI',
      state: 'exited',
      action: 'auto_resume',
      enabled: false,
      priority: 900,
      maxRetries: 1,
      prompt: defaultExitPrompt,
      resumeCommand: '',
    },
    {
      id: 'blocked-fallback',
      label: 'Blocked error fallback',
      state: 'blocked',
      action: 'trigger_fallback_agent',
      enabled: true,
      priority: 800,
      maxRetries: 2,
      prompt: defaultFallbackInstruction,
      resumeCommand: '',
    },
    {
      id: 'hard-stall-fallback',
      label: 'Hard stall fallback',
      state: 'hard_stall',
      action: 'trigger_fallback_agent',
      enabled: true,
      priority: 700,
      maxRetries: 2,
      prompt: defaultFallbackInstruction,
      resumeCommand: '',
    },
    {
      id: 'waiting-continue',
      label: 'Waiting continue',
      state: 'waiting',
      action: 'inject_local_prompt',
      enabled: true,
      priority: 600,
      maxRetries: 2,
      prompt: defaultContinuePrompt,
      resumeCommand: '',
    },
    {
      id: 'waiting-fallback',
      label: 'Waiting fallback',
      state: 'waiting',
      action: 'trigger_fallback_agent',
      enabled: true,
      priority: 500,
      maxRetries: 1,
      prompt: defaultFallbackInstruction,
      resumeCommand: '',
    },
    {
      id: 'soft-stall-continue',
      label: 'Soft stall continue',
      state: 'soft_stall',
      action: 'inject_local_prompt',
      enabled: true,
      priority: 400,
      maxRetries: 2,
      prompt: defaultContinuePrompt,
      resumeCommand: '',
    },
    {
      id: 'soft-stall-fallback',
      label: 'Soft stall fallback',
      state: 'soft_stall',
      action: 'trigger_fallback_agent',
      enabled: true,
      priority: 300,
      maxRetries: 1,
      prompt: defaultFallbackInstruction,
      resumeCommand: '',
    },
  ],
  circuitBreaker: {
    enabled: true,
    windowMs: 10 * 60_000,
    maxRecoveries: 3,
    manualInterventionPatterns: [
      'password:',
      'enter api key',
      'api key required',
      'login required',
      'authentication required',
      'payment required',
      'billing required',
      'captcha',
      'verification code',
      'two-factor',
      '2fa',
      'oauth',
    ],
  },
}

let activePolicy = defaultWatchdogPolicy
let compiledWaitingPatterns = compilePatternList(defaultWatchdogPolicy.waitingPatterns)
let compiledBlockedPatterns = compilePatternList(defaultWatchdogPolicy.blockedPatterns)
let compiledManualInterventionPatterns = compilePatternList(
  defaultWatchdogPolicy.circuitBreaker.manualInterventionPatterns,
)

function appDataDir() {
  return join(app.getPath('userData'), 'continuous')
}

function sessionsFilePath() {
  return join(appDataDir(), 'sessions.json')
}

function policiesDir() {
  return join(appDataDir(), 'policies')
}

function policyFilePath() {
  return join(policiesDir(), 'default.json')
}

function presetsDir() {
  return join(appDataDir(), 'presets')
}

function presetsFilePath() {
  return join(presetsDir(), 'default.json')
}

function configsDir() {
  return join(exportsDir(), 'configs')
}

function transcriptsDir() {
  return join(appDataDir(), 'transcripts')
}

function transcriptFilePath(sessionId: string) {
  return join(transcriptsDir(), `${sessionId}.log`)
}

function exportsDir() {
  return join(appDataDir(), 'exports')
}

const presetCatalog: Record<CliPreset, CliPresetInfo> = {
  codex: {
    label: 'Codex',
    command: 'codex',
    shellKind: 'default',
    title: 'Codex CLI',
  },
  'codex-resume': {
    label: 'Codex Resume',
    command: 'codex resume --last',
    shellKind: 'default',
    title: 'Codex Resume',
  },
  claude: {
    label: 'Claude',
    command: 'claude',
    shellKind: 'default',
    title: 'Claude CLI',
  },
  'claude-continue': {
    label: 'Claude Continue',
    command: 'claude -c',
    shellKind: 'default',
    title: 'Claude Continue',
  },
  gemini: {
    label: 'Gemini',
    command: 'gemini',
    shellKind: 'default',
    title: 'Gemini CLI',
  },
  shell: {
    label: 'Local Shell',
    command: '',
    shellKind: 'default',
    title: 'Local Shell',
  },
  wsl: {
    label: 'WSL',
    command: '',
    shellKind: 'wsl',
    title: 'WSL Shell',
  },
  custom: {
    label: 'Custom',
    command: '',
    shellKind: 'default',
    title: 'Custom CLI',
  },
}

let activePresetCatalog: Record<CliPreset, CliPresetInfo> = { ...presetCatalog }

const fallbackAgents = [
  {
    name: 'claude',
    command: 'claude',
    args: (prompt: string) => ['-p', prompt, '--output-format', 'json'],
  },
  {
    name: 'gemini',
    command: 'gemini',
    args: (prompt: string) => ['-p', prompt, '--output-format', 'json'],
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalString(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return null
  return value.length <= maxLength ? value : null
}

function readOptionalBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') return null
  return value
}

function readOptionalInt(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value >= min && value <= max ? value : null
}

function readPolicyNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function readPolicyBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readPolicyStringList(value: unknown, fallback: readonly string[], maxItems: number): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return items.length > 0 ? items.slice(0, maxItems) : [...fallback]
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return allowed.find((item) => item === value) ?? null
}

function readOptionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined | null {
  if (value === undefined) return undefined
  return readEnum(value, allowed)
}

function normalizeRecoveryRule(value: unknown, fallback: RecoveryRule): RecoveryRule {
  const source = isRecord(value) ? value : {}
  const state = readEnum(source.state, recoveryStateValues) ?? fallback.state
  const action = readEnum(source.action, recoveryActionValues) ?? fallback.action
  const enabled = action === 'auto_resume' ? false : readPolicyBoolean(source.enabled, fallback.enabled)
  return {
    id: typeof source.id === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(source.id) ? source.id : fallback.id,
    label:
      typeof source.label === 'string' && source.label.trim().length > 0
        ? source.label.trim().slice(0, MAX_TITLE_CHARS)
        : fallback.label,
    state,
    action,
    enabled,
    priority: readPolicyNumber(source.priority, fallback.priority, 0, 10_000),
    maxRetries: readPolicyNumber(source.maxRetries, fallback.maxRetries, 1, 20),
    prompt: typeof source.prompt === 'string' ? source.prompt.slice(0, MAX_PROMPT_CHARS) : fallback.prompt,
    resumeCommand:
      typeof source.resumeCommand === 'string'
        ? source.resumeCommand.slice(0, MAX_COMMAND_CHARS)
        : fallback.resumeCommand,
  }
}

function normalizeRecoveryRules(value: unknown) {
  if (!Array.isArray(value)) return [...defaultWatchdogPolicy.recoveryRules]
  const defaultsById = new Map(defaultWatchdogPolicy.recoveryRules.map((rule) => [rule.id, rule]))
  const rules = value
    .slice(0, 40)
    .map((item, index) => {
      const fallback =
        isRecord(item) && typeof item.id === 'string'
          ? (defaultsById.get(item.id) ?? defaultWatchdogPolicy.recoveryRules[index])
          : defaultWatchdogPolicy.recoveryRules[index]
      return fallback ? normalizeRecoveryRule(item, fallback) : null
    })
    .filter((rule): rule is RecoveryRule => rule !== null)

  return rules.length > 0 ? rules : [...defaultWatchdogPolicy.recoveryRules]
}

function normalizeCircuitBreakerPolicy(value: unknown): CircuitBreakerPolicy {
  const source = isRecord(value) ? value : {}
  const fallback = defaultWatchdogPolicy.circuitBreaker
  return {
    enabled: readPolicyBoolean(source.enabled, fallback.enabled),
    windowMs: readPolicyNumber(source.windowMs, fallback.windowMs, 60_000, 3_600_000),
    maxRecoveries: readPolicyNumber(source.maxRecoveries, fallback.maxRecoveries, 1, 20),
    manualInterventionPatterns: readPolicyStringList(
      source.manualInterventionPatterns,
      fallback.manualInterventionPatterns,
      100,
    ),
  }
}

function normalizeWatchdogPolicy(value: unknown): WatchdogPolicy {
  const source = isRecord(value) ? value : {}
  return {
    version: 1,
    checkIntervalMs: readPolicyNumber(source.checkIntervalMs, defaultWatchdogPolicy.checkIntervalMs, 1_000, 120_000),
    softStallMs: readPolicyNumber(source.softStallMs, defaultWatchdogPolicy.softStallMs, 30_000, 3_600_000),
    hardStallMs: readPolicyNumber(source.hardStallMs, defaultWatchdogPolicy.hardStallMs, 60_000, 7_200_000),
    injectCooldownMs: readPolicyNumber(
      source.injectCooldownMs,
      defaultWatchdogPolicy.injectCooldownMs,
      10_000,
      3_600_000,
    ),
    maxLocalContinueRetry: readPolicyNumber(
      source.maxLocalContinueRetry,
      defaultWatchdogPolicy.maxLocalContinueRetry,
      0,
      10,
    ),
    outputTailLimit: readPolicyNumber(source.outputTailLimit, defaultWatchdogPolicy.outputTailLimit, 20_000, 1_000_000),
    doneMarkers: readPolicyStringList(source.doneMarkers, defaultWatchdogPolicy.doneMarkers, 50),
    waitingPatterns: readPolicyStringList(source.waitingPatterns, defaultWatchdogPolicy.waitingPatterns, 100),
    blockedPatterns: readPolicyStringList(source.blockedPatterns, defaultWatchdogPolicy.blockedPatterns, 100),
    recoveryRules: normalizeRecoveryRules(source.recoveryRules),
    circuitBreaker: normalizeCircuitBreakerPolicy(source.circuitBreaker),
  }
}

function validatePatternList(label: string, patterns: readonly string[]) {
  const errors: string[] = []
  patterns.forEach((pattern, index) => {
    try {
      void new RegExp(pattern, 'i')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid regex'
      errors.push(`${label}[${index + 1}] ${message}`)
    }
  })
  return errors
}

function validateRecoveryRules(rules: readonly RecoveryRule[]) {
  const errors: string[] = []
  const seen = new Set<string>()
  rules.forEach((rule, index) => {
    if (seen.has(rule.id)) errors.push(`recoveryRules[${index + 1}] duplicate id "${rule.id}".`)
    seen.add(rule.id)
    if (!recoveryStateValues.includes(rule.state)) errors.push(`recoveryRules[${index + 1}] invalid state.`)
    if (!recoveryActionValues.includes(rule.action)) errors.push(`recoveryRules[${index + 1}] invalid action.`)
    if (rule.label.trim().length === 0) errors.push(`recoveryRules[${index + 1}] label is required.`)
    if (rule.action === 'auto_resume' && rule.state !== 'exited') {
      errors.push(`recoveryRules[${index + 1}] auto_resume can only be used for exited state.`)
    }
  })
  return errors
}

function validatePolicy(policy: WatchdogPolicy) {
  const errors: string[] = []
  if (policy.hardStallMs < policy.softStallMs) errors.push('Hard stall must be greater than or equal to soft stall.')
  if (policy.doneMarkers.length === 0) errors.push('At least one done marker is required.')
  if (policy.waitingPatterns.length === 0) errors.push('At least one waiting pattern is required.')
  if (policy.blockedPatterns.length === 0) errors.push('At least one blocked pattern is required.')
  if (policy.recoveryRules.length === 0) errors.push('At least one recovery rule is required.')
  return [
    ...errors,
    ...validatePatternList('waitingPatterns', policy.waitingPatterns),
    ...validatePatternList('blockedPatterns', policy.blockedPatterns),
    ...validatePatternList('manualInterventionPatterns', policy.circuitBreaker.manualInterventionPatterns),
    ...validateRecoveryRules(policy.recoveryRules),
  ]
}

async function saveActivePolicy(policy: WatchdogPolicy) {
  activePolicy = policy
  compiledWaitingPatterns = compilePatternList(activePolicy.waitingPatterns)
  compiledBlockedPatterns = compilePatternList(activePolicy.blockedPatterns)
  compiledManualInterventionPatterns = compilePatternList(activePolicy.circuitBreaker.manualInterventionPatterns)
  await mkdir(policiesDir(), { recursive: true })
  await writeFile(policyFilePath(), `${JSON.stringify(activePolicy, null, 2)}\n`, 'utf8')
}

async function loadWatchdogPolicy() {
  await mkdir(policiesDir(), { recursive: true })
  const text = await readFile(policyFilePath(), 'utf8').catch(() => '')
  const parsed: unknown = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      })()
    : null

  activePolicy = normalizeWatchdogPolicy(parsed)
  if (activePolicy.hardStallMs < activePolicy.softStallMs) {
    activePolicy.hardStallMs = activePolicy.softStallMs
  }
  await saveActivePolicy(activePolicy)
}

async function updateWatchdogPolicy(payload: unknown): Promise<PolicySaveResult> {
  const policy = normalizeWatchdogPolicy(payload)
  const errors = validatePolicy(policy)
  if (errors.length > 0) return { ok: false, errors }
  await saveActivePolicy(policy)
  sessions.forEach((session) => {
    appendEvent(session, 'policy-updated', 'Watchdog policy updated')
  })
  return { ok: true, policy }
}

function parseSessionConfig(value: unknown): CliSessionConfig | null {
  if (!isRecord(value)) return null

  const preset = readEnum(value.preset, cliPresetValues)
  if (!preset) return null

  const title = readOptionalString(value.title, MAX_TITLE_CHARS)
  const cwd = readOptionalString(value.cwd, MAX_PATH_CHARS)
  const command = readOptionalString(value.command, MAX_COMMAND_CHARS)
  const shellKind = readOptionalEnum(value.shellKind, shellKindValues)
  const runMode = readOptionalEnum(value.runMode, runModeValues)
  const initialPrompt = readOptionalString(value.initialPrompt, MAX_PROMPT_CHARS)
  const injectInitialPrompt = readOptionalBoolean(value.injectInitialPrompt)
  const watchdogEnabled = readOptionalBoolean(value.watchdogEnabled)
  const supervisorProtocol = readOptionalBoolean(value.supervisorProtocol)
  const runnerBackend = readOptionalEnum(value.runnerBackend, runnerBackendValues)
  const cols = readOptionalInt(value.cols, 20, 400)
  const rows = readOptionalInt(value.rows, 8, 200)

  if (
    title === null ||
    cwd === null ||
    command === null ||
    shellKind === null ||
    runMode === null ||
    initialPrompt === null ||
    injectInitialPrompt === null ||
    watchdogEnabled === null ||
    supervisorProtocol === null ||
    runnerBackend === null ||
    cols === null ||
    rows === null
  ) {
    return null
  }

  const config: CliSessionConfig = { preset }
  if (title !== undefined) config.title = title
  if (cwd !== undefined) config.cwd = cwd
  if (command !== undefined) config.command = command
  if (shellKind !== undefined) config.shellKind = shellKind
  if (runMode !== undefined) config.runMode = runMode
  if (initialPrompt !== undefined) config.initialPrompt = initialPrompt
  if (injectInitialPrompt !== undefined) config.injectInitialPrompt = injectInitialPrompt
  if (watchdogEnabled !== undefined) config.watchdogEnabled = watchdogEnabled
  if (supervisorProtocol !== undefined) config.supervisorProtocol = supervisorProtocol
  if (runnerBackend !== undefined) config.runnerBackend = runnerBackend
  if (cols !== undefined) config.cols = cols
  if (rows !== undefined) config.rows = rows
  return config
}

function parseSessionId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null
}

function parseControlPayload(value: unknown) {
  if (!isRecord(value)) return null
  const id = parseSessionId(value.id)
  const runMode = readOptionalEnum(value.runMode, runModeValues)
  const watchdogEnabled = readOptionalBoolean(value.watchdogEnabled)
  const supervisorProtocol = readOptionalBoolean(value.supervisorProtocol)
  if (!id || runMode === null || watchdogEnabled === null || supervisorProtocol === null) return null

  const payload: { id: string; runMode?: RunMode; watchdogEnabled?: boolean; supervisorProtocol?: boolean } = { id }
  if (runMode !== undefined) payload.runMode = runMode
  if (watchdogEnabled !== undefined) payload.watchdogEnabled = watchdogEnabled
  if (supervisorProtocol !== undefined) payload.supervisorProtocol = supervisorProtocol
  return payload
}

function parsePromptPayload(value: unknown) {
  if (!isRecord(value)) return null
  const id = parseSessionId(value.id)
  const prompt = readOptionalString(value.prompt, MAX_PROMPT_CHARS)
  const kind = readOptionalString(value.kind, 80)
  const submitFromRenderer = readOptionalBoolean(value.submitFromRenderer)
  const delivery = readOptionalEnum(value.delivery, promptDeliveryValues)
  if (!id || !prompt?.trim() || kind === null || submitFromRenderer === null || delivery === null) return null

  const payload: {
    id: string
    prompt: string
    kind?: string
    submitFromRenderer?: boolean
    delivery?: PromptDelivery
  } = { id, prompt }
  if (kind !== undefined && kind.trim()) payload.kind = kind
  if (submitFromRenderer !== undefined) payload.submitFromRenderer = submitFromRenderer
  if (delivery !== undefined) payload.delivery = delivery
  return payload
}

function parseInputPayload(value: unknown) {
  if (!isRecord(value)) return null
  const id = parseSessionId(value.id)
  const data = readOptionalString(value.data, MAX_TERMINAL_INPUT_CHARS)
  if (!id || data === undefined || data === null) return null
  return { id, data }
}

function parseScreenSnapshotPayload(value: unknown) {
  if (!isRecord(value)) return null
  const id = parseSessionId(value.id)
  const text = readOptionalString(value.text, MAX_SCREEN_SNAPSHOT_CHARS)
  if (!id || text === undefined || text === null) return null
  return { id, text }
}

function parseClipboardText(value: unknown) {
  return typeof value === 'string' && value.length <= MAX_PROMPT_CHARS ? value : null
}

function parseResizePayload(value: unknown) {
  if (!isRecord(value)) return null
  const id = parseSessionId(value.id)
  const cols = readOptionalInt(value.cols, 20, 400)
  const rows = readOptionalInt(value.rows, 8, 200)
  if (!id || cols === undefined || cols === null || rows === undefined || rows === null) return null
  return { id, cols, rows }
}

function normalizePresetInfo(value: unknown, fallback: CliPresetInfo): CliPresetInfo {
  const source = isRecord(value) ? value : {}
  const label = readOptionalString(source.label, 80)
  const command = readOptionalString(source.command, MAX_COMMAND_CHARS)
  const shellKind = readOptionalEnum(source.shellKind, shellKindValues)
  const title = readOptionalString(source.title, MAX_TITLE_CHARS)

  return {
    label: label?.trim() || fallback.label,
    command: command ?? fallback.command,
    shellKind: shellKind ?? fallback.shellKind,
    title: title?.trim() || fallback.title,
  }
}

function normalizePresetCatalog(value: unknown): Record<CliPreset, CliPresetInfo> {
  const source = isRecord(value) ? value : {}
  return cliPresetValues.reduce<Record<CliPreset, CliPresetInfo>>(
    (items, preset) => {
      items[preset] = normalizePresetInfo(source[preset], presetCatalog[preset])
      return items
    },
    {} as Record<CliPreset, CliPresetInfo>,
  )
}

function validatePresetCatalog(value: Record<CliPreset, CliPresetInfo>) {
  const errors: string[] = []
  cliPresetValues.forEach((preset) => {
    const item = value[preset]
    if (!item.label.trim()) errors.push(`${preset}: label is required.`)
    if (!item.title.trim()) errors.push(`${preset}: title is required.`)
    if (!shellKindValues.includes(item.shellKind)) errors.push(`${preset}: shell kind is invalid.`)
  })
  return errors
}

async function saveActivePresetCatalog(presets: Record<CliPreset, CliPresetInfo>) {
  activePresetCatalog = presets
  await mkdir(presetsDir(), { recursive: true })
  await writeFile(presetsFilePath(), `${JSON.stringify(activePresetCatalog, null, 2)}\n`, 'utf8')
}

async function loadPresetCatalog() {
  await mkdir(presetsDir(), { recursive: true })
  const text = await readFile(presetsFilePath(), 'utf8').catch(() => '')
  const parsed: unknown = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      })()
    : null
  await saveActivePresetCatalog(normalizePresetCatalog(parsed))
}

async function updatePresetCatalog(payload: unknown): Promise<PresetSaveResult> {
  const presets = normalizePresetCatalog(payload)
  const errors = validatePresetCatalog(presets)
  if (errors.length > 0) return { ok: false, errors }
  await saveActivePresetCatalog(presets)
  return { ok: true, presets }
}

async function exportJsonConfig(name: string, value: unknown): Promise<ConfigFileResult> {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  await mkdir(configsDir(), { recursive: true })
  const path = join(configsDir(), `${timestamp}_${name}.json`)
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return { path }
}

async function importJsonFile() {
  const result = await dialog.showOpenDialog({
    title: 'Import JSON configuration',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const text = await readFile(result.filePaths[0], 'utf8')
  return JSON.parse(text) as unknown
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: windowSize.width,
    height: windowSize.height,
    minWidth: 1180,
    minHeight: 760,
    title: 'Continuous CLI Cockpit',
    titleBarStyle: 'hidden',
    backgroundColor: '#05070a',
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', revealMainWindow)
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[continuous] preload failed: ${preloadPath}`)
    console.error(error)
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[continuous] window load failed: ${code} ${description}`)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    revealMainWindow()
    void mainWindow?.webContents
      .executeJavaScript('Boolean(window.cliAPI)')
      .then((available: unknown) => {
        console.log(`[continuous] Electron bridge available: ${available === true}`)
      })
      .catch((error: unknown) => {
        console.error('[continuous] bridge diagnostic failed')
        console.error(error)
      })
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }
}

function normalizeCwd(cwd?: string) {
  if (!cwd?.trim()) return process.cwd()
  const target = resolve(cwd.trim())
  return existsSync(target) ? target : process.cwd()
}

function resolveShell(shellKind: ShellKind) {
  if (shellKind === 'powershell') return { file: 'powershell.exe', args: ['-NoLogo'] }
  if (shellKind === 'cmd') return { file: 'cmd.exe', args: [] }
  if (shellKind === 'bash') return { file: 'bash', args: ['-l'] }
  if (shellKind === 'wsl') return { file: 'wsl.exe', args: [] }

  if (platform() === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] }
  return { file: process.env.SHELL || 'bash', args: ['-l'] }
}

type SubmitMode = 'normal' | 'reinforced'
type PromptInjectionOptions = {
  delivery?: PromptDelivery
  submit?: boolean
}

function pressEnter(session: CliSession, key: '\r' | '\n' = '\r') {
  if (session.ptyProcess) {
    session.ptyProcess.write(key)
    return
  }
  if (session.runnerBackend === 'tmux' && session.tmuxSessionName) {
    void tmuxPressEnter(session).catch((error) => {
      appendEvent(session, 'tmux-send-failed', error.message)
    })
  }
}

function scheduleSubmitSequence(session: CliSession, mode: SubmitMode, delayMs: number) {
  setTimeout(() => {
    if (sessions.get(session.id) === session) pressEnter(session, '\r')
  }, delayMs)

  if (mode === 'reinforced') {
    setTimeout(() => {
      if (sessions.get(session.id) === session) pressEnter(session, '\n')
    }, delayMs + TERMINAL_SUBMIT_FALLBACK_DELAY_MS)
    setTimeout(() => {
      if (sessions.get(session.id) === session) pressEnter(session, '\r')
    }, delayMs + TERMINAL_SUBMIT_FINAL_DELAY_MS)
  }
}

function promptSubmitDelay(text: string) {
  return Math.min(1_800, Math.max(TERMINAL_SUBMIT_DELAY_MS, Math.ceil(text.length / 35)))
}

function normalizePasteText(text: string) {
  return text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function promptEventDetail(prompt: string, delivery: PromptDelivery) {
  const preview = prompt
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  const safePreview = preview ? `: ${preview.slice(0, 120)}` : ''
  return `${delivery}; ${prompt.trim().length} chars${safePreview}`
}

function writeLine(session: CliSession, line: string, mode: SubmitMode = 'normal') {
  if (session.ptyProcess) {
    session.ptyProcess.write(line)
    scheduleSubmitSequence(session, mode, TERMINAL_SUBMIT_DELAY_MS)
    return
  }
  if (session.runnerBackend === 'tmux' && session.tmuxSessionName) {
    void tmuxSubmitLine(session, line).catch((error) => {
      appendEvent(session, 'tmux-send-failed', error.message)
    })
  }
}

async function writeDirectPrompt(session: CliSession, prompt: string, submit: boolean) {
  const text = normalizePasteText(prompt)
  if (!text) return

  if (session.ptyProcess) {
    const payload = text.includes('\n') ? `\x1b[200~${text}\x1b[201~` : text
    session.ptyProcess.write(payload)
    if (submit) scheduleSubmitSequence(session, 'reinforced', promptSubmitDelay(text))
    return
  }

  if (session.runnerBackend === 'tmux' && session.tmuxSessionName) {
    await tmuxPasteText(session, text)
    if (submit) scheduleSubmitSequence(session, 'reinforced', promptSubmitDelay(text))
  }
}

function writeTextOnly(session: CliSession, text: string) {
  if (session.ptyProcess) {
    session.ptyProcess.write(text)
    return
  }
  if (session.runnerBackend === 'tmux' && session.tmuxSessionName) {
    void tmuxPasteText(session, text).catch((error) => {
      appendEvent(session, 'tmux-send-failed', error.message)
    })
  }
}

function submitEnter(session: CliSession, mode: SubmitMode = 'normal') {
  scheduleSubmitSequence(session, mode, 0)
  appendEvent(session, 'terminal-submit', `Submitted Enter (${mode})`)
}

function doneFlagCandidates(session: CliSession, marker: string) {
  const normalized = marker.trim().replaceAll('\\', '/')
  if (!normalized) return []

  if (normalized.includes('/')) {
    return [resolve(session.cwd, normalized)]
  }

  return [
    resolve(session.cwd, normalized),
    resolve(session.cwd, '.agent-supervisor', normalized),
    resolve(session.cwd, '.continuous', normalized),
  ]
}

function collectDoneFlagMatches(session: CliSession): DoneFlagMatch[] {
  return activePolicy.doneMarkers.flatMap((marker) => {
    const trimmed = marker.trim()
    if (!trimmed || !isDoneFlagMarker(trimmed)) return []
    const matchedPath = doneFlagCandidates(session, trimmed).find((candidate) => existsSync(candidate))
    return matchedPath ? [{ marker: trimmed, path: matchedPath }] : []
  })
}

function classifierPolicy(): WatchdogClassifierPolicy {
  return {
    blockedPatterns: compiledBlockedPatterns,
    doneMarkers: activePolicy.doneMarkers,
    manualInterventionEnabled: activePolicy.circuitBreaker.enabled,
    manualInterventionPatterns: compiledManualInterventionPatterns,
    waitingPatterns: compiledWaitingPatterns,
  }
}

function watchdogOutputSource(session: CliSession) {
  const hasFreshScreen =
    session.screenText.trim().length > 0 && Date.now() - session.screenCapturedAt <= SCREEN_SNAPSHOT_STALE_MS
  return hasFreshScreen ? session.screenText : session.outputTail
}

function classifyTerminal(session: CliSession) {
  return classifyWatchdogOutput({
    doneFlagMatches: collectDoneFlagMatches(session),
    output: watchdogOutputSource(session),
    policy: classifierPolicy(),
  })
}

function isSessionDone(session: CliSession) {
  return classifyTerminal(session).kind === 'done'
}

function snapshot(session: CliSession): CliSnapshot {
  const { ptyProcess, recoveryInFlight, ruleRetryCounts, screenText, screenCapturedAt, ...value } = session
  void ptyProcess
  void recoveryInFlight
  void ruleRetryCounts
  void screenText
  void screenCapturedAt
  return value
}

function broadcast(channel: string, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((window) => {
    sendToWindow(window, channel, payload)
  })
}

function isDisposedFrameError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Render frame was disposed before WebFrameMain could be accessed') ||
    message.includes('Object has been destroyed')
  )
}

function sendToWindow(window: BrowserWindow, channel: string, payload: unknown) {
  if (window.isDestroyed()) return

  const { webContents } = window
  if (webContents.isDestroyed()) return

  try {
    const frame = webContents.mainFrame
    if (frame.isDestroyed() || frame.detached) return
    frame.send(channel, payload)
  } catch (error) {
    if (isDisposedFrameError(error)) return
    console.error(`[continuous] failed to send ${channel}`)
    console.error(error)
  }
}

async function persistSessionsNow() {
  await mkdir(appDataDir(), { recursive: true })
  const payload = Array.from(sessions.values()).map(snapshot)
  await writeFile(sessionsFilePath(), JSON.stringify(payload, null, 2), 'utf8')
}

function schedulePersist() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistSessionsNow().catch(() => undefined)
  }, 750)
}

async function writeEventLog(event: CliEvent, cwd: string) {
  const baseDir = app.isReady() ? app.getPath('userData') : cwd
  const logDir = join(baseDir, 'continuous-events')
  const logPath = join(logDir, 'events.jsonl')
  await mkdir(logDir, { recursive: true })
  await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8')
}

async function appendTranscript(session: CliSession, data: string) {
  await mkdir(dirname(session.transcriptPath), { recursive: true })
  await appendFile(session.transcriptPath, data, 'utf8')
}

function appendEvent(session: CliSession, type: string, message: string, detail?: string) {
  const event: CliEvent = {
    id: randomUUID(),
    sessionId: session.id,
    time: Date.now(),
    type,
    message,
  }
  if (detail !== undefined) event.detail = detail
  session.events = [event, ...session.events].slice(0, MAX_EVENTS)
  void writeEventLog(event, session.cwd).catch(() => undefined)
  schedulePersist()
  if (sessions.get(session.id) === session && !stoppingSessionIds.has(session.id)) {
    broadcast('cli:session-update', snapshot(session))
  }
}

function updateStatus(session: CliSession, status: CliStatus, reason: string) {
  if (session.status === status && session.statusReason === reason) return
  session.status = status
  session.statusReason = reason
  appendEvent(session, 'status', `${status}: ${reason}`)
}

function appendOutput(session: CliSession, data: string) {
  session.outputTail = `${session.outputTail}${data}`.slice(-activePolicy.outputTailLimit)
  session.lastOutputAt = Date.now()
  void appendTranscript(session, data).catch((error) => {
    appendEvent(session, 'transcript-write-failed', error.message)
  })
  if (!['done', 'exited'].includes(session.status)) {
    updateStatus(session, 'running', 'terminal output received')
  }
  schedulePersist()
  broadcast('cli:terminal-data', { id: session.id, data })
}

function canInject(session: CliSession) {
  return Date.now() - session.lastInjectAt >= activePolicy.injectCooldownMs
}

function renderPolicyTemplate(template: string, session: CliSession, reason: string) {
  const replacements: Record<string, string> = {
    command: session.command || '(shell only)',
    cwd: session.cwd,
    reason,
    status: session.status,
    title: session.title,
  }

  return template.replace(
    /\{\{(command|cwd|reason|status|title)\}\}/g,
    (_match, key: string) => replacements[key] ?? '',
  )
}

async function writePromptFile(session: CliSession, kind: string, prompt: string) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const safeKind = kind.replace(/[^a-zA-Z0-9_-]/g, '_')
  const dir = join(session.cwd, '.continuous', 'prompts')
  const filePath = join(dir, `${timestamp}_${safeKind}.md`)
  await mkdir(dir, { recursive: true })
  await writeFile(filePath, prompt, 'utf8')
  return filePath
}

async function injectPrompt(session: CliSession, kind: string, prompt: string, options: PromptInjectionOptions = {}) {
  const delivery = options.delivery ?? 'direct'
  const submit = options.submit !== false
  session.lastInjectAt = Date.now()
  session.totalRecoveries += 1

  if (delivery === 'file') {
    const promptPath = await writePromptFile(session, kind, prompt)
    const oneLine = `Please read "${promptPath}" and treat it as my latest instruction. Continue from the current context.`
    appendEvent(session, 'prompt-injected', `Injected ${kind} as file reference`, promptPath)
    if (submit) {
      writeLine(session, oneLine, 'reinforced')
      appendEvent(
        session,
        'prompt-submitted',
        `Submitted ${kind} file reference with reinforced Enter sequence`,
        promptPath,
      )
    } else {
      writeTextOnly(session, oneLine)
      appendEvent(
        session,
        'prompt-awaiting-submit',
        `Injected ${kind} file reference; renderer will submit Enter`,
        promptPath,
      )
    }
    return
  }

  appendEvent(session, 'prompt-injected', `Injected ${kind} directly`, promptEventDetail(prompt, delivery))
  if (submit) {
    await writeDirectPrompt(session, prompt, true)
    appendEvent(session, 'prompt-submitted', `Submitted ${kind} directly with reinforced Enter sequence`)
  } else {
    writeTextOnly(session, normalizePasteText(prompt))
    appendEvent(session, 'prompt-awaiting-submit', `Injected ${kind} directly; renderer will submit Enter`)
  }
}

function buildLocalContinuePrompt(session: CliSession, reason: string, promptTemplate?: string) {
  const base = [renderPolicyTemplate(promptTemplate?.trim() || defaultContinuePrompt, session, reason)]

  if (session.supervisorProtocol) {
    base.push(
      'Use the optional project supervision files if they exist:',
      '- .agent-supervisor/PROGRESS.md',
      '- .agent-supervisor/HEARTBEAT.txt',
      '- .agent-supervisor/BLOCKED.flag',
      '- .agent-supervisor/DONE.flag',
      'If the task is complete, create .agent-supervisor/DONE.flag and print BENCHMARK_DONE.',
    )
  }

  return base.join('\n')
}

function buildFallbackPrompt(session: CliSession, reason: string, policyInstruction?: string) {
  const plainTail = stripAnsi(watchdogOutputSource(session) || session.outputTail).slice(-28_000)
  const supervision = session.supervisorProtocol
    ? 'The primary CLI may optionally use .agent-supervisor files. Mention them only if useful.'
    : 'Do not require .agent-supervisor files; this is a normal human-operated CLI session.'
  const instruction = policyInstruction?.trim()
    ? `Policy-specific instruction:\n${renderPolicyTemplate(policyInstruction, session, reason)}`
    : 'Policy-specific instruction: Use the general recovery rules below.'

  return `
You are a recovery prompt generator, not the primary executor.

Your only job is to generate one concise prompt that can be sent back to the primary interactive CLI.
Do not ask the user to operate manually. Do not claim you will modify files. Do not run commands.

Rules:
- The primary CLI is the only executor.
- The prompt must tell it how to continue from the current terminal context.
- Avoid forcing a project-specific workflow unless the context already shows one.
- If the output suggests completion, tell the primary CLI to finish cleanly.
- If the output suggests an error loop, tell it the smallest next diagnostic or fix.
- ${supervision}

${instruction}

Session:
title: ${session.title}
preset: ${session.preset}
cwd: ${session.cwd}
command: ${session.command || '(shell only)'}
shell: ${session.shellKind}
mode: ${session.runMode}
status: ${session.status}
reason: ${reason}
local_retry: ${session.localRetry}
fallback_retry: ${session.fallbackRetry}

Recent terminal output:
${plainTail}
`.trim()
}

function extractAgentResponse(stdout: string) {
  const text = stdout.trim()
  if (!text) return ''

  try {
    const data = JSON.parse(text) as Record<string, unknown>
    for (const key of ['response', 'result', 'text', 'message']) {
      const value = data[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    const content = data.content
    if (Array.isArray(content)) {
      const parts = content
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && 'text' in item) {
            const value = (item as { text?: unknown }).text
            return typeof value === 'string' ? value : ''
          }
          return ''
        })
        .filter(Boolean)
      if (parts.length) return parts.join('\n').trim()
    }
  } catch {
    return text
  }

  return text
}

function scoreDecodedText(text: string) {
  if (!text) return 0
  const replacementCount = [...text].filter((char) => char === '\uFFFD').length
  const controlCount = [...text].filter((char) => {
    const code = char.charCodeAt(0)
    return code < 32 && !['\n', '\r', '\t'].includes(char)
  }).length
  return replacementCount * 4 + controlCount * 2
}

function normalizeLegacyKnownProcessMojibake(text: string) {
  return text.replace(/鎴供鐚┄鐞犵暛悌告笭鐟槧鐣懏/g, '/bin/sh: tmux: not found')
}

const knownProcessMojibakePairs = [
  {
    mojibake: Buffer.from('/bin/sh: tmux: not found', 'utf8').toString('utf16le'),
    replacement: '/bin/sh: tmux: not found',
  },
]

function normalizeKnownProcessMojibake(text: string) {
  const legacyNormalized = normalizeLegacyKnownProcessMojibake(text)
  return knownProcessMojibakePairs.reduce(
    (current, pair) => current.split(pair.mojibake).join(pair.replacement),
    legacyNormalized,
  )
}

function decodeProcessChunk(buffer: Buffer) {
  const utf8 = buffer.toString('utf8')
  const utf16 = buffer.toString('utf16le')
  const decoded = scoreDecodedText(utf16) < scoreDecodedText(utf8) ? utf16 : utf8
  return normalizeKnownProcessMojibake(stripAnsi(decoded).split(String.fromCharCode(0)).join(''))
}

function decodeProcessOutput(chunks: Buffer[]) {
  if (chunks.length === 0) return ''
  return chunks.map(decodeProcessChunk).join('')
}

function collectProcessOutput(command: string, args: string[], cwd: string, timeoutMs: number, inputText?: string) {
  return new Promise<{ code: number | null; output: string }>((resolveProcess) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: process.env,
    })

    const chunks: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill()
      resolveProcess({ code: -1, output: decodeProcessOutput(chunks) })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    if (inputText !== undefined) {
      child.stdin.end(inputText)
    }
    child.on('error', (error) => {
      clearTimeout(timer)
      resolveProcess({ code: -1, output: `${decodeProcessOutput(chunks)}\n${error.message}`.trim() })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveProcess({ code, output: decodeProcessOutput(chunks) })
    })
  })
}

function readableHealthDetail(label: string, result: { code: number | null; output: string }) {
  const output = result.output.trim()

  if (result.code === 0) {
    if (label === 'WSL') return 'WSL is available'
    return output.split(/\r?\n/).find(Boolean)?.trim() || `${label} is available`
  }

  if (label === 'tmux' && /tmux(?:\.exe)?: not found|tmux: not found|not found/i.test(output)) {
    return 'tmux is not installed in WSL. Run: sudo apt update && sudo apt install -y tmux'
  }

  if (label === 'WSL') {
    return output || 'WSL is unavailable. Install or repair WSL before using tmux detached sessions.'
  }

  return output || `${label} is unavailable`
}

async function checkCommand(command: string, args: string[], label: string): Promise<RuntimeHealthItem> {
  const result = await collectProcessOutput(command, args, process.cwd(), 15_000)
  return {
    available: result.code === 0,
    command: [command, ...args].join(' '),
    detail: readableHealthDetail(label, result).slice(-2_000),
  }
}

async function getRuntimeHealth(): Promise<RuntimeHealth> {
  const isWindows = platform() === 'win32'
  const wsl = isWindows ? await checkCommand('wsl.exe', ['--status'], 'WSL') : null
  const tmux = isWindows
    ? await checkCommand('wsl.exe', ['tmux', '-V'], 'tmux')
    : await checkCommand('tmux', ['-V'], 'tmux')

  return {
    checkedAt: Date.now(),
    platform: platform(),
    tmux,
    wsl,
  }
}

function windowsPathToWslPath(pathValue: string) {
  const match = /^([a-zA-Z]):\\(.*)$/.exec(pathValue)
  if (!match) return pathValue.replace(/\\/g, '/')
  const drive = match[1]
  const restPart = match[2]
  if (!drive || restPart === undefined) return pathValue.replace(/\\/g, '/')
  const rest = restPart.replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
}

function tmuxCommandParts(session: Pick<CliSession, 'shellKind'>) {
  if (platform() === 'win32' || session.shellKind === 'wsl') {
    return { file: 'wsl.exe', prefix: ['tmux'] }
  }
  return { file: 'tmux', prefix: [] as string[] }
}

async function runTmux(session: Pick<CliSession, 'cwd' | 'shellKind'>, args: string[], inputText?: string) {
  const command = tmuxCommandParts(session)
  return collectProcessOutput(command.file, [...command.prefix, ...args], session.cwd, 30_000, inputText)
}

async function tmuxHasSession(session: Pick<CliSession, 'cwd' | 'shellKind'>, name: string) {
  const result = await runTmux(session, ['has-session', '-t', name])
  return result.code === 0
}

function parseTmuxInt(value: string) {
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

async function getSessionDiagnostics(id: string): Promise<SessionDiagnostics | false> {
  const session = sessions.get(id)
  if (!session) return false

  const base: SessionDiagnostics = {
    checkedAt: Date.now(),
    runnerBackend: session.runnerBackend,
    attached: session.attached,
    tmuxSessionName: session.tmuxSessionName ?? null,
    tmuxAlive: null,
    tmuxAttachedClients: null,
    tmuxPaneCount: null,
    tmuxLastLine: '',
    tmuxCaptureTail: '',
    detail: session.runnerBackend === 'tmux' ? 'tmux not checked yet' : 'pty sessions do not have tmux diagnostics',
  }

  if (session.runnerBackend !== 'tmux' || !session.tmuxSessionName) return base

  const alive = await tmuxHasSession(session, session.tmuxSessionName)
  if (!alive) {
    return {
      ...base,
      tmuxAlive: false,
      detail: 'tmux session is not running',
    }
  }

  const clients = await runTmux(session, [
    'display-message',
    '-p',
    '-t',
    session.tmuxSessionName,
    '#{session_attached}',
  ])
  const panes = await runTmux(session, ['list-panes', '-t', session.tmuxSessionName, '-F', '#{pane_id}'])
  const lastLine = await runTmux(session, ['capture-pane', '-t', session.tmuxSessionName, '-p', '-S', '-1'])
  const captureTail = await runTmux(session, ['capture-pane', '-t', session.tmuxSessionName, '-p', '-S', '-40'])
  const paneLines = panes.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    ...base,
    tmuxAlive: true,
    tmuxAttachedClients: parseTmuxInt(clients.output),
    tmuxPaneCount: paneLines.length,
    tmuxLastLine: lastLine.output.trim().slice(-1_000),
    tmuxCaptureTail: captureTail.output.trim().slice(-8_000),
    detail: 'tmux session is running',
  }
}

async function tmuxStartSession(session: Pick<CliSession, 'cwd' | 'shellKind'>, name: string) {
  const cwd = session.shellKind === 'wsl' || platform() === 'win32' ? windowsPathToWslPath(session.cwd) : session.cwd
  const result = await runTmux(session, ['new-session', '-d', '-s', name, '-c', cwd])
  if (result.code !== 0) throw new Error(result.output || 'tmux new-session failed')
}

async function tmuxKillSession(session: Pick<CliSession, 'cwd' | 'shellKind'>, name: string) {
  await runTmux(session, ['kill-session', '-t', name])
}

async function tmuxPasteText(session: CliSession, text: string) {
  if (!session.tmuxSessionName) return
  const bufferName = `continuous_${randomUUID().replace(/-/g, '')}`
  const load = await runTmux(session, ['load-buffer', '-b', bufferName, '-'], text)
  if (load.code !== 0) throw new Error(load.output || 'tmux load-buffer failed')
  const paste = await runTmux(session, ['paste-buffer', '-b', bufferName, '-t', session.tmuxSessionName])
  void runTmux(session, ['delete-buffer', '-b', bufferName]).catch(() => undefined)
  if (paste.code !== 0) throw new Error(paste.output || 'tmux paste-buffer failed')
}

async function tmuxPressEnter(session: CliSession) {
  if (!session.tmuxSessionName) return
  const result = await runTmux(session, ['send-keys', '-t', session.tmuxSessionName, 'Enter'])
  if (result.code !== 0) throw new Error(result.output || 'tmux send Enter failed')
}

async function tmuxSubmitLine(session: CliSession, line: string) {
  await tmuxPasteText(session, line)
  await tmuxPressEnter(session)
}

function attachPty(session: CliSession, file: string, args: string[], cwd: string, cols = 120, rows = 36) {
  const ptyProcess = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      TERM: 'xterm-256color',
    },
  })

  session.ptyProcess = ptyProcess
  session.attached = true
  ptyProcess.onData((data) => appendOutput(session, data))
  ptyProcess.onExit(() => {
    if (session.ptyProcess === ptyProcess) {
      session.ptyProcess = undefined
      session.attached = false
    }
    if (sessions.get(session.id) !== session || stoppingSessionIds.has(session.id)) return
    if (session.runnerBackend === 'tmux') {
      updateStatus(session, 'detached', 'tmux attach process detached')
    } else {
      updateStatus(session, 'exited', 'shell process exited')
    }
    schedulePersist()
  })
}

async function callFallbackAgent(session: CliSession, reason: string, policyInstruction?: string) {
  const prompt = buildFallbackPrompt(session, reason, policyInstruction)
  session.lastSuggestedPrompt = ''
  appendEvent(session, 'fallback-start', 'Generating recovery prompt')

  for (const agent of fallbackAgents) {
    const result = await collectProcessOutput(agent.command, agent.args(prompt), session.cwd, 600_000)
    if (result.code === 0) {
      const response = extractAgentResponse(result.output)
      if (response.length > 20) {
        session.lastSuggestedPrompt = response
        appendEvent(session, 'fallback-success', `Recovery prompt generated by ${agent.name}`)
        return response
      }
    }
    appendEvent(
      session,
      'fallback-failed',
      `${agent.name} could not generate a usable prompt`,
      result.output.slice(-1000),
    )
  }

  const fallback = buildLocalContinuePrompt(session, reason, policyInstruction)
  session.lastSuggestedPrompt = fallback
  appendEvent(session, 'fallback-empty', 'Fallback agents unavailable; using local recovery prompt')
  return fallback
}

async function escalateFallback(session: CliSession, reason: string, inject: boolean, policyInstruction?: string) {
  if (session.recoveryInFlight) {
    appendEvent(session, 'recovery-skipped', 'Recovery already in flight', reason)
    return false
  }
  if (inject && !canInject(session)) {
    appendEvent(session, 'recovery-skipped', 'Injection cooldown active', reason)
    return false
  }

  session.recoveryInFlight = true
  session.fallbackRetry += 1
  updateStatus(session, 'recovering', `fallback recovery: ${reason}`)

  try {
    const prompt = await callFallbackAgent(session, reason, policyInstruction)
    if (inject) {
      await injectPrompt(session, 'fallback_recovery', prompt)
      session.localRetry = 0
    }
    return true
  } finally {
    session.recoveryInFlight = false
    broadcast('cli:session-update', snapshot(session))
  }
}

async function localContinue(session: CliSession, reason: string, promptTemplate?: string) {
  if (!canInject(session)) {
    appendEvent(session, 'recovery-skipped', 'Injection cooldown active', reason)
    return false
  }
  session.localRetry += 1
  updateStatus(session, 'recovering', `local recovery: ${reason}`)
  await injectPrompt(session, 'local_continue', buildLocalContinuePrompt(session, reason, promptTemplate))
  return true
}

function countRecentEvents(session: CliSession, predicate: (event: CliEvent) => boolean) {
  const windowStart = Date.now() - activePolicy.circuitBreaker.windowMs
  return session.events.filter((event) => event.time >= windowStart && predicate(event)).length
}

function countRecentRuleAttempts(session: CliSession, ruleId: string) {
  return countRecentEvents(
    session,
    (event) => event.type === 'policy-action' && (event.detail ?? '').includes(`"ruleId":"${ruleId}"`),
  )
}

function countRecentRecoveryActions(session: CliSession) {
  return countRecentEvents(session, (event) => event.type === 'policy-action')
}

function interruptAutopilot(session: CliSession, reason: string, detail?: string) {
  updateStatus(session, 'blocked', `autopilot paused: ${reason}`)
  appendEvent(session, 'autopilot-paused', reason, detail)
  schedulePersist()
}

function openCircuitIfNeeded(session: CliSession, reason: string) {
  if (!activePolicy.circuitBreaker.enabled) return false
  const recentActions = countRecentRecoveryActions(session)
  if (recentActions < activePolicy.circuitBreaker.maxRecoveries) return false

  interruptAutopilot(
    session,
    'recovery circuit breaker opened',
    `${reason}. ${recentActions} recovery actions in ${activePolicy.circuitBreaker.windowMs}ms.`,
  )
  return true
}

function resolveRecoveryRule(session: CliSession, state: RecoveryState) {
  const candidates = activePolicy.recoveryRules
    .filter((rule) => rule.enabled && rule.state === state)
    .sort((left, right) => right.priority - left.priority)

  return candidates.find((rule) => countRecentRuleAttempts(session, rule.id) < rule.maxRetries) ?? null
}

function recordPolicyAction(session: CliSession, rule: RecoveryRule, reason: string) {
  const detail = JSON.stringify({
    action: rule.action,
    reason,
    ruleId: rule.id,
    state: rule.state,
  })
  appendEvent(session, 'policy-action', `Policy rule: ${rule.label}`, detail)
}

async function compactCurrentCodexContext(session: CliSession, reason: string) {
  if (session.recoveryInFlight) {
    appendEvent(session, 'recovery-skipped', 'Recovery already in flight', reason)
    return false
  }
  if (!canInject(session)) {
    appendEvent(session, 'recovery-skipped', 'Context compact cooldown active', reason)
    return false
  }

  session.recoveryInFlight = true
  session.lastInjectAt = Date.now()
  session.totalRecoveries += 1
  updateStatus(session, 'recovering', `context compact: ${reason}`)
  appendEvent(session, 'context-compact', 'Sent /compact in the current CLI session', reason)

  try {
    writeLine(session, '/compact', 'reinforced')
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'context compact failed'
    appendEvent(session, 'context-compact-failed', message, reason)
    return false
  } finally {
    session.recoveryInFlight = false
    broadcast('cli:session-update', snapshot(session))
  }
}

async function applyRecoveryRule(session: CliSession, rule: RecoveryRule, reason: string) {
  if (rule.action === 'auto_resume') {
    appendEvent(session, 'recovery-skipped', 'Auto resume is disabled', reason)
    return false
  }
  if (rule.action !== 'interrupt' && openCircuitIfNeeded(session, reason)) return false
  if (rule.action !== 'interrupt' && !canInject(session)) {
    appendEvent(session, 'recovery-skipped', 'Injection cooldown active', reason)
    return false
  }

  recordPolicyAction(session, rule, reason)

  if (rule.action === 'interrupt') {
    interruptAutopilot(session, reason, `Matched rule: ${rule.label}`)
    return true
  }

  if (rule.action === 'inject_local_prompt') {
    return localContinue(session, reason, rule.prompt)
  }

  if (rule.action === 'trigger_fallback_agent') {
    return escalateFallback(session, reason, true, rule.prompt)
  }

  return false
}

async function attachTmuxSession(session: CliSession, cols = 120, rows = 36) {
  if (!session.tmuxSessionName) return false
  const alive = await tmuxHasSession(session, session.tmuxSessionName)
  if (!alive) {
    session.attached = false
    updateStatus(session, 'exited', 'tmux session is not running')
    return false
  }
  if (session.ptyProcess) return true
  const tmuxCommand = tmuxCommandParts(session)
  attachPty(
    session,
    tmuxCommand.file,
    [...tmuxCommand.prefix, 'attach-session', '-t', session.tmuxSessionName],
    session.cwd,
    cols,
    rows,
  )
  updateStatus(session, 'running', 'reattached to tmux session')
  appendEvent(session, 'tmux-reattached', `Attached to ${session.tmuxSessionName}`)
  return true
}

async function restorePersistedSessions() {
  const text = await readFile(sessionsFilePath(), 'utf8').catch(() => '')
  if (!text) return

  const payload = (() => {
    try {
      return JSON.parse(text) as CliSnapshot[]
    } catch {
      return [] as CliSnapshot[]
    }
  })()
  if (!payload.length) return

  for (const saved of payload) {
    const transcriptPath = saved.transcriptPath || transcriptFilePath(saved.id)
    const session: CliSession = {
      ...saved,
      runnerBackend: saved.runnerBackend || 'pty',
      outputTail: saved.outputTail || '',
      screenText: '',
      screenCapturedAt: 0,
      transcriptPath,
      events: saved.events || [],
      attached: false,
      ruleRetryCounts: {},
      ptyProcess: undefined,
      recoveryInFlight: false,
    }

    if (session.status === 'done' && !isSessionDone(session)) {
      session.status = 'running'
      session.statusReason = 'stale done marker ignored on restore'
    }

    sessions.set(session.id, session)

    if (session.runnerBackend === 'tmux' && session.tmuxSessionName) {
      const reattached = await attachTmuxSession(session)
      if (!reattached && !['done', 'exited'].includes(session.status)) {
        updateStatus(session, 'exited', 'restored history only; tmux session is gone')
      }
    } else {
      if (!['done', 'exited'].includes(session.status)) {
        updateStatus(session, 'exited', 'restored history only; pty process cannot survive app restart')
      }
    }
  }

  schedulePersist()
}

function maybeAutopilotRecover(session: CliSession, reason: string, state: RecoveryState) {
  if (session.runMode !== 'autopilot') return
  if (session.statusReason.startsWith('autopilot paused:')) return

  const rule = resolveRecoveryRule(session, state)
  if (!rule) {
    interruptAutopilot(session, 'no recovery rule available', `${state}: ${reason}`)
    return
  }

  void applyRecoveryRule(session, rule, reason)
}

function classify(session: CliSession) {
  const decision = classifyTerminal(session)

  if (decision.kind === 'done') {
    updateStatus(session, decision.status, decision.reason)
    return
  }

  if (decision.kind === 'ready') {
    updateStatus(session, decision.status, decision.reason)
    maybeAutopilotRecover(session, 'CLI prompt ready', decision.recoveryState)
    return
  }

  if (decision.kind === 'active') {
    session.localRetry = 0
    updateStatus(session, decision.status, decision.reason)
    return
  }

  if (decision.kind === 'manual_intervention') {
    updateStatus(session, decision.status, decision.reason)
    maybeAutopilotRecover(session, 'manual intervention pattern detected', decision.recoveryState)
    return
  }

  if (decision.kind === 'context_exhausted') {
    updateStatus(session, decision.status, decision.reason)
    if (session.runMode === 'autopilot') {
      void compactCurrentCodexContext(session, decision.reason)
    }
    return
  }

  if (decision.kind === 'blocked') {
    updateStatus(session, decision.status, decision.reason)
    maybeAutopilotRecover(session, 'blocked pattern detected', decision.recoveryState)
    return
  }

  if (decision.kind === 'waiting') {
    updateStatus(session, decision.status, decision.reason)
    maybeAutopilotRecover(session, 'waiting pattern detected', decision.recoveryState)
    return
  }

  const idleMs = Date.now() - session.lastOutputAt
  if (idleMs >= activePolicy.hardStallMs) {
    updateStatus(session, 'blocked', 'hard idle timeout')
    maybeAutopilotRecover(session, 'hard idle timeout', 'hard_stall')
    return
  }

  if (idleMs >= activePolicy.softStallMs) {
    updateStatus(session, 'stalled', 'soft idle timeout')
    maybeAutopilotRecover(session, 'soft idle timeout', 'soft_stall')
    return
  }

  updateStatus(session, 'running', 'watchdog observing')
}

async function createSession(config: CliSessionConfig) {
  const preset = config.preset || 'custom'
  const presetInfo = activePresetCatalog[preset]
  const cwd = normalizeCwd(config.cwd)
  const shellKind = config.shellKind || presetInfo.shellKind
  const command = typeof config.command === 'string' ? config.command.trim() : presetInfo.command
  const title = config.title?.trim() || presetInfo.title
  const runMode = config.runMode || 'manual'
  const runnerBackend = config.runnerBackend || 'pty'
  const now = Date.now()
  const id = randomUUID()
  const tmuxSessionName =
    runnerBackend === 'tmux' ? `continuous_${now.toString(36)}_${randomUUID().slice(0, 8)}` : undefined

  const session: CliSession = {
    id,
    preset,
    title,
    cwd,
    command,
    shellKind,
    runnerBackend,
    tmuxSessionName,
    runMode,
    supervisorProtocol: !!config.supervisorProtocol,
    watchdogEnabled: config.watchdogEnabled ?? runMode !== 'manual',
    status: 'booting',
    statusReason: 'starting shell',
    createdAt: now,
    startedAt: now,
    lastOutputAt: now,
    lastInjectAt: 0,
    localRetry: 0,
    fallbackRetry: 0,
    totalRecoveries: 0,
    outputTail: '',
    screenText: '',
    screenCapturedAt: 0,
    transcriptPath: transcriptFilePath(id),
    lastSuggestedPrompt: '',
    events: [],
    attached: false,
    ruleRetryCounts: {},
    ptyProcess: undefined,
    recoveryInFlight: false,
  }

  sessions.set(session.id, session)
  appendEvent(session, 'session-created', `${title} created`, `${runnerBackend} / ${shellKind}`)

  try {
    if (runnerBackend === 'tmux') {
      if (!tmuxSessionName) throw new Error('Missing tmux session name')
      await tmuxStartSession(session, tmuxSessionName)
      appendEvent(session, 'tmux-started', `tmux session ${tmuxSessionName} started`)
      const tmuxCommand = tmuxCommandParts(session)
      attachPty(
        session,
        tmuxCommand.file,
        [...tmuxCommand.prefix, 'attach-session', '-t', tmuxSessionName],
        cwd,
        config.cols,
        config.rows,
      )
    } else {
      const shell = resolveShell(shellKind)
      attachPty(session, shell.file, shell.args, cwd, config.cols, config.rows)
      appendEvent(session, 'pty-started', `${shell.file} ${shell.args.join(' ')}`.trim())
    }
  } catch (error) {
    sessions.delete(session.id)
    schedulePersist()
    throw error
  }

  setTimeout(() => {
    if (command) {
      appendEvent(session, 'command-sent', 'Initial command sent', command)
      writeLine(session, command)
    }
    if (config.injectInitialPrompt && config.initialPrompt?.trim()) {
      setTimeout(() => {
        void injectPrompt(session, 'start', config.initialPrompt || '')
      }, 800)
    }
  }, 300)

  broadcast('cli:session-update', snapshot(session))
  schedulePersist()
  return session
}

async function stopSession(id: string) {
  const session = sessions.get(id)
  if (!session) return false
  stoppingSessionIds.add(id)
  try {
    const ptyProcess = session.ptyProcess
    const shouldKillTmux = session.runnerBackend === 'tmux' && !!session.tmuxSessionName
    const tmuxSessionName = session.tmuxSessionName

    appendEvent(session, 'session-stopped', 'Session stopped by user')
    session.runMode = 'manual'
    session.watchdogEnabled = false
    session.ptyProcess = undefined
    session.attached = false
    sessions.delete(id)

    ptyProcess?.kill()
    if (shouldKillTmux && tmuxSessionName) {
      await tmuxKillSession(session, tmuxSessionName)
    }

    await persistSessionsNow()
    broadcast('cli:session-ended', { id })
    return true
  } finally {
    stoppingSessionIds.delete(id)
  }
}

function safeExportName(value: string) {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_')
  return safe.slice(0, 80) || 'session'
}

async function exportSession(id: string): Promise<SessionExportResult | false> {
  const session = sessions.get(id)
  if (!session) return false

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const exportDir = join(exportsDir(), `${timestamp}_${safeExportName(session.title)}_${session.id.slice(0, 8)}`)
  await mkdir(exportDir, { recursive: true })

  const sessionSnapshot = snapshot(session)
  await writeFile(join(exportDir, 'session.json'), `${JSON.stringify(sessionSnapshot, null, 2)}\n`, 'utf8')
  await writeFile(join(exportDir, 'events.json'), `${JSON.stringify(session.events, null, 2)}\n`, 'utf8')
  await writeFile(join(exportDir, 'output-tail.txt'), session.outputTail, 'utf8')
  await writeFile(join(exportDir, 'watchdog-policy.json'), `${JSON.stringify(activePolicy, null, 2)}\n`, 'utf8')

  if (session.lastSuggestedPrompt) {
    await writeFile(join(exportDir, 'last-recovery-suggestion.md'), session.lastSuggestedPrompt, 'utf8')
  }

  const transcript = await readFile(session.transcriptPath, 'utf8').catch(() => '')
  if (transcript) {
    await writeFile(join(exportDir, 'transcript.log'), transcript, 'utf8')
  }

  await writeFile(
    join(exportDir, 'README.md'),
    [
      '# Continuous CLI Session Export',
      '',
      `Session: ${session.title}`,
      `Working directory: ${session.cwd}`,
      `Command: ${session.command || '(shell only)'}`,
      `Runner: ${session.runnerBackend}`,
      `Status: ${session.status} - ${session.statusReason}`,
      '',
      'Files:',
      '- session.json',
      '- events.json',
      '- output-tail.txt',
      '- transcript.log, when available',
      '- watchdog-policy.json',
      '- last-recovery-suggestion.md, when available',
      '',
    ].join('\n'),
    'utf8',
  )

  appendEvent(session, 'session-exported', 'Session export created', exportDir)
  return { path: exportDir }
}

function isEndedSession(session: CliSession) {
  return session.status === 'done' || session.status === 'exited'
}

async function writeArchivedSession(session: CliSession, archiveDir: string) {
  const sessionDir = join(archiveDir, `${safeExportName(session.title)}_${session.id.slice(0, 8)}`)
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, 'session.json'), `${JSON.stringify(snapshot(session), null, 2)}\n`, 'utf8')
  await writeFile(join(sessionDir, 'events.json'), `${JSON.stringify(session.events, null, 2)}\n`, 'utf8')
  await writeFile(join(sessionDir, 'output-tail.txt'), session.outputTail, 'utf8')
  const transcript = await readFile(session.transcriptPath, 'utf8').catch(() => '')
  if (transcript) await writeFile(join(sessionDir, 'transcript.log'), transcript, 'utf8')
}

async function archiveEndedSessions(): Promise<SessionMaintenanceResult> {
  const ended = Array.from(sessions.values()).filter(isEndedSession)
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const archiveDir = join(exportsDir(), 'archives', timestamp)

  if (ended.length === 0) return { count: 0, path: archiveDir }

  await mkdir(archiveDir, { recursive: true })
  for (const session of ended) {
    await writeArchivedSession(session, archiveDir)
    sessions.delete(session.id)
    broadcast('cli:session-ended', { id: session.id })
  }
  await writeFile(
    join(archiveDir, 'index.json'),
    `${JSON.stringify(
      ended.map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        cwd: session.cwd,
        command: session.command,
      })),
      null,
      2,
    )}\n`,
    'utf8',
  )
  await persistSessionsNow()
  return { count: ended.length, path: archiveDir }
}

async function clearEndedSessions(): Promise<SessionMaintenanceResult> {
  const ended = Array.from(sessions.values()).filter(isEndedSession)
  ended.forEach((session) => {
    sessions.delete(session.id)
    broadcast('cli:session-ended', { id: session.id })
  })
  await persistSessionsNow()
  return { count: ended.length }
}

async function readTranscript(id: string): Promise<TranscriptReadResult | false> {
  const session = sessions.get(id)
  if (!session) return false

  const text = await readFile(session.transcriptPath, 'utf8').catch(() => '')
  if (text.length <= MAX_TRANSCRIPT_READ_CHARS) {
    return {
      path: session.transcriptPath,
      text,
      truncated: false,
      size: text.length,
    }
  }

  return {
    path: session.transcriptPath,
    text: text.slice(-MAX_TRANSCRIPT_READ_CHARS),
    truncated: true,
    size: text.length,
  }
}

function runWatchdogTick() {
  sessions.forEach((session) => {
    if (session.watchdogEnabled && !['done', 'exited'].includes(session.status)) classify(session)
  })
}

function scheduleWatchdogTick() {
  setTimeout(() => {
    runWatchdogTick()
    scheduleWatchdogTick()
  }, activePolicy.checkIntervalMs)
}

ipcMain.handle('app:defaults', () => ({
  cwd: process.cwd(),
  home: homedir(),
  presets: activePresetCatalog,
  runnerBackends: ['pty', 'tmux'] satisfies RunnerBackend[],
  policy: activePolicy,
}))

ipcMain.handle('app:health', () => getRuntimeHealth())

ipcMain.handle('policy:get', () => activePolicy)

ipcMain.handle('policy:set', (_event, payload: unknown) => updateWatchdogPolicy(payload))

ipcMain.handle('policy:reset', async () => {
  await saveActivePolicy(defaultWatchdogPolicy)
  sessions.forEach((session) => {
    appendEvent(session, 'policy-reset', 'Watchdog policy reset to defaults')
  })
  return activePolicy
})

ipcMain.handle('policy:export', () => exportJsonConfig('watchdog-policy', activePolicy))

ipcMain.handle('policy:import', async () => {
  try {
    const payload = await importJsonFile()
    if (!payload) return { ok: false, errors: ['No policy file selected.'] } satisfies PolicySaveResult
    return updateWatchdogPolicy(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Policy import failed.'
    return { ok: false, errors: [message] } satisfies PolicySaveResult
  }
})

ipcMain.handle('presets:get', () => activePresetCatalog)

ipcMain.handle('presets:set', (_event, payload: unknown) => updatePresetCatalog(payload))

ipcMain.handle('presets:reset', async () => {
  await saveActivePresetCatalog({ ...presetCatalog })
  return activePresetCatalog
})

ipcMain.handle('presets:export', () => exportJsonConfig('cli-presets', activePresetCatalog))

ipcMain.handle('presets:import', async () => {
  try {
    const payload = await importJsonFile()
    if (!payload) return { ok: false, errors: ['No preset file selected.'] } satisfies PresetSaveResult
    return updatePresetCatalog(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preset import failed.'
    return { ok: false, errors: [message] } satisfies PresetSaveResult
  }
})

ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'showHiddenFiles'],
  })
  if (result.canceled) return null
  return result.filePaths[0] || null
})

ipcMain.handle('clipboard:write-text', (_event, payload: unknown) => {
  const text = parseClipboardText(payload)
  if (text === null) return false
  clipboard.writeText(text)
  return true
})

ipcMain.handle('cli:list', () => Array.from(sessions.values()).map(snapshot))

ipcMain.handle('cli:create', async (_event, payload: unknown) => {
  const config = parseSessionConfig(payload)
  if (!config) throw new Error('Invalid CLI session configuration')
  const session = await createSession(config)
  return snapshot(session)
})

ipcMain.handle('cli:stop', (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  return id ? stopSession(id) : false
})

ipcMain.handle('cli:reattach', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  if (!id) return false
  const session = sessions.get(id)
  if (!session || session.runnerBackend !== 'tmux') return false
  const ok = await attachTmuxSession(session)
  return ok ? snapshot(session) : false
})

ipcMain.handle('cli:set-control', (_event, rawPayload: unknown) => {
  const payload = parseControlPayload(rawPayload)
  if (!payload) return false
  const session = sessions.get(payload.id)
  if (!session) return false
  if (payload.runMode) session.runMode = payload.runMode
  if (typeof payload.watchdogEnabled === 'boolean') session.watchdogEnabled = payload.watchdogEnabled
  if (typeof payload.supervisorProtocol === 'boolean') session.supervisorProtocol = payload.supervisorProtocol
  if (session.status === 'done' && session.watchdogEnabled && !isSessionDone(session)) {
    session.status = 'running'
    session.statusReason = 'watchdog re-enabled after stale done marker'
  }
  appendEvent(session, 'control-updated', 'Control settings updated')
  if (session.watchdogEnabled && !['done', 'exited'].includes(session.status)) classify(session)
  return snapshot(session)
})

ipcMain.handle('cli:inject-local', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  if (!id) return false
  const session = sessions.get(id)
  if (!session) return false
  await injectPrompt(session, 'manual_local_continue', buildLocalContinuePrompt(session, 'manual request'))
  return true
})

ipcMain.handle('cli:inject-prompt', async (_event, rawPayload: unknown) => {
  const payload = parsePromptPayload(rawPayload)
  if (!payload) return false
  const session = sessions.get(payload.id)
  if (!session) return false
  await injectPrompt(session, payload.kind ?? 'manual_prompt', payload.prompt, {
    delivery: payload.delivery ?? 'direct',
    submit: payload.submitFromRenderer ? false : true,
  })
  return true
})

ipcMain.handle('cli:submit-enter', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  if (!id) return false
  const session = sessions.get(id)
  if (!session) return false
  submitEnter(session, 'reinforced')
  return true
})

ipcMain.handle('cli:generate-fallback', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  if (!id) return false
  const session = sessions.get(id)
  if (!session) return false
  await escalateFallback(session, 'manual fallback generation', false)
  return snapshot(session)
})

ipcMain.handle('cli:fallback-inject', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  if (!id) return false
  const session = sessions.get(id)
  if (!session) return false
  return escalateFallback(session, 'manual fallback injection', true)
})

ipcMain.handle('cli:export-session', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  return id ? exportSession(id) : false
})

ipcMain.handle('cli:archive-ended', () => archiveEndedSessions())

ipcMain.handle('cli:clear-ended', () => clearEndedSessions())

ipcMain.handle('cli:read-transcript', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  return id ? readTranscript(id) : false
})

ipcMain.handle('cli:diagnostics', async (_event, payload: unknown) => {
  const id = parseSessionId(payload)
  return id ? getSessionDiagnostics(id) : false
})

ipcMain.on('cli:input', (_event, rawPayload: unknown) => {
  const payload = parseInputPayload(rawPayload)
  if (!payload) return
  const session = sessions.get(payload.id)
  session?.ptyProcess?.write(payload.data)
})

ipcMain.on('cli:resize', (_event, rawPayload: unknown) => {
  const payload = parseResizePayload(rawPayload)
  if (!payload) return
  const session = sessions.get(payload.id)
  try {
    session?.ptyProcess?.resize(payload.cols, payload.rows)
  } catch {
    // The PTY can be gone during resize.
  }
})

ipcMain.on('cli:screen-snapshot', (_event, rawPayload: unknown) => {
  const payload = parseScreenSnapshotPayload(rawPayload)
  if (!payload) return
  const session = sessions.get(payload.id)
  if (!session) return
  session.screenText = payload.text.slice(-MAX_SCREEN_SNAPSHOT_CHARS)
  session.screenCapturedAt = Date.now()
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', revealMainWindow)

  app.whenReady().then(async () => {
    await loadWatchdogPolicy()
    await loadPresetCatalog()
    await restorePersistedSessions()
    createWindow()
    scheduleWatchdogTick()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else revealMainWindow()
    })
  })
}

app.on('window-all-closed', async () => {
  sessions.forEach((session) => {
    session.ptyProcess?.kill()
    session.ptyProcess = undefined
    session.attached = false
    if (session.runnerBackend === 'tmux' && !['done', 'exited'].includes(session.status)) {
      session.status = 'detached'
      session.statusReason = 'Electron detached; tmux session may still be running'
    }
    if (session.runnerBackend === 'pty' && !['done', 'exited'].includes(session.status)) {
      session.status = 'exited'
      session.statusReason = 'Electron closed the pty session'
    }
  })
  await persistSessionsNow().catch(() => undefined)
  if (process.platform !== 'darwin') app.quit()
})
