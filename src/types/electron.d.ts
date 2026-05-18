export type CliPreset = 'codex' | 'codex-resume' | 'claude' | 'claude-continue' | 'gemini' | 'shell' | 'wsl' | 'custom'

export type ShellKind = 'default' | 'powershell' | 'cmd' | 'bash' | 'wsl'
export type RunMode = 'manual' | 'assisted' | 'autopilot'
export type RunnerBackend = 'pty' | 'tmux'
export type CliStatus =
  | 'booting'
  | 'running'
  | 'waiting'
  | 'stalled'
  | 'blocked'
  | 'recovering'
  | 'done'
  | 'detached'
  | 'exited'

export type CliPresetInfo = {
  label: string
  command: string
  shellKind: ShellKind
  title: string
}

export type CliEvent = {
  id: string
  sessionId: string
  time: number
  type: string
  message: string
  detail?: string
}

export type RecoveryState = 'waiting' | 'soft_stall' | 'hard_stall' | 'blocked' | 'exited' | 'manual_intervention'
export type RecoveryAction = 'inject_local_prompt' | 'trigger_fallback_agent' | 'auto_resume' | 'interrupt'

export type RecoveryRule = {
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

export type CircuitBreakerPolicy = {
  enabled: boolean
  windowMs: number
  maxRecoveries: number
  manualInterventionPatterns: string[]
}

export type WatchdogPolicy = {
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

export type SessionExportResult = {
  path: string
}

export type RuntimeHealthItem = {
  available: boolean
  command: string
  detail: string
}

export type RuntimeHealth = {
  checkedAt: number
  platform: string
  tmux: RuntimeHealthItem
  wsl: RuntimeHealthItem | null
}

export type PolicySaveResult = { ok: true; policy: WatchdogPolicy } | { ok: false; errors: string[] }

export type PresetSaveResult = { ok: true; presets: Record<CliPreset, CliPresetInfo> } | { ok: false; errors: string[] }

export type ConfigFileResult = {
  path: string
}

export type SessionMaintenanceResult = {
  count: number
  path?: string
}

export type TranscriptReadResult = {
  path: string
  text: string
  truncated: boolean
  size: number
}

export type SessionDiagnostics = {
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

export type CliSessionConfig = {
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

export type CliSessionSnapshot = {
  id: string
  preset: CliPreset
  title: string
  cwd: string
  command: string
  shellKind: ShellKind
  runnerBackend: RunnerBackend
  tmuxSessionName?: string
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
  transcriptPath: string
  lastSuggestedPrompt: string
  events: CliEvent[]
  attached: boolean
}

export type CliDefaults = {
  cwd: string
  home: string
  presets: Record<CliPreset, CliPresetInfo>
  runnerBackends: RunnerBackend[]
  policy: WatchdogPolicy
}

declare global {
  interface Window {
    cliAPI: {
      getDefaults: () => Promise<CliDefaults>
      getHealth: () => Promise<RuntimeHealth>
      getPolicy: () => Promise<WatchdogPolicy>
      setPolicy: (policy: WatchdogPolicy) => Promise<PolicySaveResult>
      resetPolicy: () => Promise<WatchdogPolicy>
      exportPolicy: () => Promise<ConfigFileResult>
      importPolicy: () => Promise<PolicySaveResult>
      getPresets: () => Promise<Record<CliPreset, CliPresetInfo>>
      setPresets: (presets: Record<CliPreset, CliPresetInfo>) => Promise<PresetSaveResult>
      resetPresets: () => Promise<Record<CliPreset, CliPresetInfo>>
      exportPresets: () => Promise<ConfigFileResult>
      importPresets: () => Promise<PresetSaveResult>
      copyText: (text: string) => Promise<boolean>
      openDirectory: () => Promise<string | null>
      listSessions: () => Promise<CliSessionSnapshot[]>
      createSession: (config: CliSessionConfig) => Promise<CliSessionSnapshot>
      stopSession: (id: string) => Promise<boolean>
      reattachSession: (id: string) => Promise<CliSessionSnapshot | false>
      setControl: (payload: {
        id: string
        runMode?: RunMode
        watchdogEnabled?: boolean
        supervisorProtocol?: boolean
      }) => Promise<CliSessionSnapshot | false>
      injectLocalContinue: (id: string) => Promise<boolean>
      injectPrompt: (payload: {
        id: string
        prompt: string
        delivery?: 'direct' | 'file'
        kind?: string
        submitFromRenderer?: boolean
      }) => Promise<boolean>
      submitEnter: (id: string) => Promise<boolean>
      generateFallback: (id: string) => Promise<CliSessionSnapshot | false>
      fallbackAndInject: (id: string) => Promise<boolean>
      exportSession: (id: string) => Promise<SessionExportResult | false>
      readTranscript: (id: string) => Promise<TranscriptReadResult | false>
      getDiagnostics: (id: string) => Promise<SessionDiagnostics | false>
      archiveEndedSessions: () => Promise<SessionMaintenanceResult>
      clearEndedSessions: () => Promise<SessionMaintenanceResult>
      sendInput: (payload: { id: string; data: string }) => void
      resizeTerminal: (payload: { id: string; cols: number; rows: number }) => void
      sendScreenSnapshot: (payload: { id: string; text: string }) => void
      onTerminalData: (callback: (payload: { id: string; data: string }) => void) => () => void
      onSessionUpdate: (callback: (payload: CliSessionSnapshot) => void) => () => void
      onSessionEnded: (callback: (payload: { id: string }) => void) => () => void
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
