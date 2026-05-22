import clsx from 'clsx'
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Download,
  Gauge,
  PanelRight,
  Play,
  Power,
  RefreshCw,
  Rocket,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDuration, formatTime, statusMeta } from '../domain/cli'
import { type SessionControls, useSessionControls } from '../hooks/useSessionControls'
import { type RuntimeHealthController, useRuntimeHealth } from '../hooks/useRuntimeHealth'
import type {
  CliEvent,
  CliDefaults,
  CliSessionConfig,
  CliSessionSnapshot,
  RuntimeHealthItem,
  WatchdogPolicy,
} from '../types/electron'
import { AutopilotPipeline } from './AutopilotPipeline'
import { LaunchPanel } from './LaunchPanel'
import { OperationsPanel } from './OperationsPanel'
import { PolicyEditor } from './PolicyEditor'
import { PromptComposer } from './PromptComposer'
import { RunModeSelector } from './RunModeSelector'
import { SessionDiagnosticsPanel } from './SessionDiagnosticsPanel'
import { TranscriptViewer } from './TranscriptViewer'

type SupervisorPanelProps = {
  activeSession: CliSessionSnapshot | undefined
  defaults: CliDefaults | null
  onCreate: (config: CliSessionConfig) => Promise<CliSessionSnapshot>
  onDefaultsUpdated: () => Promise<CliDefaults>
  onSessionsUpdated: () => Promise<CliSessionSnapshot[]>
  onUpdated: (session: CliSessionSnapshot) => void
  onStop: (id: string) => void
}

type CockpitTab = 'session' | 'launch' | 'automation' | 'logs'

const cockpitTabs: readonly {
  id: CockpitTab
  label: string
  icon: typeof Gauge
}[] = [
  { id: 'session', label: 'Session', icon: Gauge },
  { id: 'launch', label: 'Launch', icon: Rocket },
  { id: 'automation', label: 'Auto', icon: SlidersHorizontal },
  { id: 'logs', label: 'Logs', icon: ClipboardList },
]

/**
 * Right-side control plane. The UI is intentionally split by operator intent:
 * current-session work, launch, automation, and audit logs.
 */
export function SupervisorPanel({
  activeSession,
  defaults,
  onCreate,
  onDefaultsUpdated,
  onSessionsUpdated,
  onUpdated,
  onStop,
}: SupervisorPanelProps) {
  const controls = useSessionControls(activeSession, onUpdated)
  const runtimeHealth = useRuntimeHealth()
  const [now, setNow] = useState(() => Date.now())
  const [loadedPolicy, setLoadedPolicy] = useState<{ key: string; policy: WatchdogPolicy } | null>(null)
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [activeTab, setActiveTab] = useState<CockpitTab>(() => (activeSession ? 'session' : 'launch'))

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const policyCwd = activeSession?.cwd
  const policySessionId = activeSession?.id
  const policyKey = policySessionId ?? policyCwd ?? 'default'

  useEffect(() => {
    let cancelled = false
    window.cliAPI
      .getPolicy(policySessionId ? { sessionId: policySessionId } : policyCwd ? { cwd: policyCwd } : undefined)
      .then((nextPolicy) => {
        if (!cancelled) setLoadedPolicy({ key: policyKey, policy: nextPolicy })
      })
    return () => {
      cancelled = true
    }
  }, [activeSession?.hasSessionPolicyOverride, policyCwd, policyKey, policySessionId])

  const policy = loadedPolicy?.key === policyKey ? loadedPolicy.policy : (defaults?.policy ?? null)
  const setScopedPolicy = (nextPolicy: WatchdogPolicy) => setLoadedPolicy({ key: policyKey, policy: nextPolicy })
  const uptime = activeSession ? now - activeSession.startedAt : 0
  const idle = activeSession ? now - activeSession.lastOutputAt : 0
  const cooldownMs = policy?.injectCooldownMs ?? 120_000
  const cooldown = activeSession ? Math.max(0, cooldownMs - (now - activeSession.lastInjectAt)) : 0
  const visibleTab = !activeSession && (activeTab === 'session' || activeTab === 'logs') ? 'launch' : activeTab

  return (
    <aside className="flex w-[410px] shrink-0 flex-col overflow-hidden rounded-md border border-cyan-300/20 bg-[#091018]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-cyan-300/20 px-3">
        <PanelRight size={16} className="text-cyan-200" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-mono text-sm text-cyan-100">Cockpit</div>
          <div className="truncate text-[11px] text-zinc-600">
            {activeSession ? activeSession.title : 'Start a CLI or configure automation'}
          </div>
        </div>
      </div>

      <div className="cockpit-tabs">
        {cockpitTabs.map((tab) => {
          const Icon = tab.icon
          const disabled = !activeSession && (tab.id === 'session' || tab.id === 'logs')
          return (
            <button
              key={tab.id}
              className={clsx('cockpit-tab', visibleTab === tab.id && 'active')}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={13} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {visibleTab === 'session' && activeSession && (
          <SessionTab
            activeSession={activeSession}
            controls={controls}
            cooldown={cooldown}
            idle={idle}
            onStop={onStop}
            uptime={uptime}
          />
        )}

        {visibleTab === 'launch' && <LaunchTab defaults={defaults} onCreate={onCreate} runtimeHealth={runtimeHealth} />}

        {visibleTab === 'automation' && (
          <AutomationTab
            activeSession={activeSession}
            controls={controls}
            cooldown={cooldown}
            now={now}
            policy={policy}
            policyCwd={policyCwd}
            policySessionId={policySessionId}
            hasSessionPolicyOverride={activeSession?.hasSessionPolicyOverride ?? false}
            setPolicy={setScopedPolicy}
          />
        )}

        {visibleTab === 'logs' && activeSession && (
          <LogsTab
            activeSession={activeSession}
            controls={controls}
            onDefaultsUpdated={onDefaultsUpdated}
            onSessionsUpdated={onSessionsUpdated}
            policyUpdated={setScopedPolicy}
            setTranscriptQuery={setTranscriptQuery}
            transcriptQuery={transcriptQuery}
          />
        )}
      </div>
    </aside>
  )
}

function SessionTab({
  activeSession,
  controls,
  cooldown,
  idle,
  onStop,
  uptime,
}: {
  activeSession: CliSessionSnapshot
  controls: SessionControls
  cooldown: number
  idle: number
  onStop: (id: string) => void
  uptime: number
}) {
  return (
    <div className="space-y-4">
      <section>
        <div className="panel-title">
          <Gauge size={15} aria-hidden="true" />
          Current session
        </div>
        <StatusBanner session={activeSession} />
        <SessionSummary activeSession={activeSession} cooldown={cooldown} idle={idle} uptime={uptime} />
      </section>

      <PromptComposer
        prompt={controls.manualPrompt}
        onCopy={controls.copyManualPrompt}
        onInjectDirect={controls.injectManualPromptDirect}
        onInjectFile={controls.injectManualPrompt}
        onPromptChange={controls.setManualPrompt}
        onSubmitEnter={controls.submitEnter}
      />

      <section>
        <div className="panel-title">
          <Play size={15} aria-hidden="true" />
          Quick actions
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeSession.runnerBackend === 'tmux' && !activeSession.attached && (
            <button className="tool-button" type="button" onClick={controls.reattach}>
              <SquareTerminal size={14} aria-hidden="true" />
              Reattach
            </button>
          )}
          <button className="tool-button" type="button" onClick={controls.injectLocalPrompt}>
            <Play size={14} aria-hidden="true" />
            继续
          </button>
          <button className="tool-button" type="button" onClick={controls.generateSuggestion}>
            <BrainCircuit size={14} aria-hidden="true" />
            Suggest
          </button>
          <button className="tool-button" type="button" onClick={controls.fallbackAndInject}>
            <Sparkles size={14} aria-hidden="true" />
            Suggest + send
          </button>
          <button className="tool-button danger" type="button" onClick={() => onStop(activeSession.id)}>
            <Power size={14} aria-hidden="true" />
            Stop
          </button>
        </div>
      </section>

      {activeSession.lastSuggestedPrompt && (
        <section className="section-box">
          <div className="mb-2 text-xs font-semibold text-cyan-200">Last recovery suggestion</div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">
            {activeSession.lastSuggestedPrompt}
          </pre>
        </section>
      )}
    </div>
  )
}

function LaunchTab({
  defaults,
  onCreate,
  runtimeHealth,
}: {
  defaults: CliDefaults | null
  onCreate: (config: CliSessionConfig) => Promise<CliSessionSnapshot>
  runtimeHealth: RuntimeHealthController
}) {
  return (
    <div className="space-y-4">
      <RuntimeHealthPreview
        isChecking={runtimeHealth.isChecking}
        tmux={runtimeHealth.health?.tmux ?? null}
        wsl={runtimeHealth.health?.wsl ?? null}
        onRefresh={runtimeHealth.refresh}
      />
      <LaunchPanel defaults={defaults} tmuxHealth={runtimeHealth.health?.tmux ?? null} onCreate={onCreate} />
    </div>
  )
}

function AutomationTab({
  activeSession,
  controls,
  cooldown,
  hasSessionPolicyOverride,
  now,
  policy,
  policyCwd,
  policySessionId,
  setPolicy,
}: {
  activeSession: CliSessionSnapshot | undefined
  controls: SessionControls
  cooldown: number
  hasSessionPolicyOverride: boolean
  now: number
  policy: WatchdogPolicy | null
  policyCwd: string | undefined
  policySessionId: string | undefined
  setPolicy: (policy: WatchdogPolicy) => void
}) {
  const policySource = policySessionId
    ? hasSessionPolicyOverride
      ? 'Session Override'
      : 'Project Default'
    : policyCwd
      ? 'Project Policy'
      : 'Default Policy'

  return (
    <div className="space-y-4">
      {activeSession ? (
        <section>
          <div className="panel-title">
            <Settings2 size={15} aria-hidden="true" />
            Mode
          </div>
          <RunModeSelector
            value={activeSession.runMode}
            onChange={(runMode) => controls.updateControl({ runMode, watchdogEnabled: runMode !== 'manual' })}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="toggle-row">
              <span>Watchdog</span>
              <input
                checked={activeSession.watchdogEnabled}
                type="checkbox"
                onChange={(event) => controls.updateControl({ watchdogEnabled: event.target.checked })}
              />
            </label>
            <label className="toggle-row">
              <span>Supervisor</span>
              <input
                checked={activeSession.supervisorProtocol}
                type="checkbox"
                onChange={(event) => controls.updateControl({ supervisorProtocol: event.target.checked })}
              />
            </label>
          </div>
        </section>
      ) : (
        <EmptyState title="No active session" body="Automation policy can still be edited before launch." />
      )}

      {activeSession && policy && (
        <AutopilotPipeline
          cooldown={cooldown}
          now={now}
          policy={policy}
          session={activeSession}
          onInterrupt={() => controls.updateControl({ runMode: 'manual', watchdogEnabled: false })}
        />
      )}

      {policy && <PolicyPreview policy={policy} source={policySource} />}

      {policy && (
        <details className="advanced-section">
          <summary>
            {policySessionId
              ? hasSessionPolicyOverride
                ? 'Session override policy editor'
                : 'Project-synced policy editor'
              : 'Default policy editor'}
          </summary>
          <PolicyEditor
            key={`${policySessionId ?? policyCwd ?? 'default'}:${policySignature(policy)}`}
            hasSessionPolicyOverride={hasSessionPolicyOverride}
            policy={policy}
            scopeCwd={policyCwd}
            scopeSessionId={policySessionId}
            onSaved={setPolicy}
          />
        </details>
      )}
    </div>
  )
}

function LogsTab({
  activeSession,
  controls,
  onDefaultsUpdated,
  onSessionsUpdated,
  policyUpdated,
  setTranscriptQuery,
  transcriptQuery,
}: {
  activeSession: CliSessionSnapshot
  controls: SessionControls
  onDefaultsUpdated: () => Promise<CliDefaults>
  onSessionsUpdated: () => Promise<CliSessionSnapshot[]>
  policyUpdated: (policy: WatchdogPolicy) => void
  setTranscriptQuery: (query: string) => void
  transcriptQuery: string
}) {
  return (
    <div className="space-y-4">
      <section>
        <div className="panel-title">
          <Download size={15} aria-hidden="true" />
          Session files
        </div>
        <button className="tool-button h-9 w-full" type="button" onClick={controls.exportSession}>
          <Download size={14} aria-hidden="true" />
          Export current session
        </button>
        {controls.lastExportPath && (
          <div className="mt-2 rounded-md border border-emerald-300/20 bg-emerald-300/5 p-2 text-xs text-emerald-100">
            <span className="text-emerald-300">Exported:</span>{' '}
            <span className="break-all font-mono">{controls.lastExportPath}</span>
          </div>
        )}
      </section>

      <SessionDiagnosticsPanel session={activeSession} />
      <TranscriptViewer
        key={`${activeSession.id}:${transcriptQuery}`}
        initialQuery={transcriptQuery}
        session={activeSession}
      />
      <TimelineList activeSession={activeSession} setTranscriptQuery={setTranscriptQuery} />
      <OperationsPanel
        policyCwd={activeSession.cwd}
        onDefaultsUpdated={onDefaultsUpdated}
        onPolicyUpdated={policyUpdated}
        onSessionsUpdated={onSessionsUpdated}
      />
    </div>
  )
}

function SessionSummary({
  activeSession,
  cooldown,
  idle,
  uptime,
}: {
  activeSession: CliSessionSnapshot
  cooldown: number
  idle: number
  uptime: number
}) {
  return (
    <div className="session-summary">
      <Metric label="Mode" value={activeSession.runMode} />
      <Metric label="Runner" value={activeSession.runnerBackend} />
      <Metric label="Idle" value={formatDuration(idle)} />
      <Metric label="Cooldown" value={formatDuration(cooldown)} />
      <Metric label="Attach" value={activeSession.attached ? 'live' : 'off'} />
      <Metric label="Uptime" value={formatDuration(uptime)} />
    </div>
  )
}

function TimelineList({
  activeSession,
  setTranscriptQuery,
}: {
  activeSession: CliSessionSnapshot
  setTranscriptQuery: (query: string) => void
}) {
  return (
    <section>
      <div className="panel-title">
        <Activity size={15} aria-hidden="true" />
        Timeline
      </div>
      <div className="space-y-2">
        {activeSession.events.slice(0, 8).map((event) => (
          <button
            key={event.id}
            className="w-full rounded-md border border-cyan-300/10 bg-black/20 p-2 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/5"
            type="button"
            onClick={() => setTranscriptQuery(timelineSearchQuery(event))}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-cyan-200">{event.type}</span>
              <span className="text-zinc-600">{formatTime(event.time)}</span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">{event.message}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="empty-panel">
      <div className="font-semibold text-zinc-200">{title}</div>
      <div className="mt-1 text-xs text-zinc-500">{body}</div>
    </div>
  )
}

function timelineSearchQuery(event: CliEvent) {
  return event.detail?.trim() || event.message.trim() || event.type
}

function policySignature(policy: WatchdogPolicy) {
  return [
    policy.checkIntervalMs,
    policy.softStallMs,
    policy.hardStallMs,
    policy.injectCooldownMs,
    policy.maxLocalContinueRetry,
    policy.outputTailLimit,
    policy.doneMarkers.join('|'),
    policy.waitingPatterns.join('|'),
    policy.blockedPatterns.join('|'),
    JSON.stringify(policy.recoveryRules),
    JSON.stringify(policy.circuitBreaker),
  ].join(':')
}

function StatusBanner({ session }: { session: CliSessionSnapshot }) {
  const meta = statusMeta[session.status]
  const StatusIcon = meta.icon

  return (
    <div className={clsx('mb-3 flex items-center gap-2 rounded-md border px-3 py-2', meta.className)}>
      <StatusIcon size={16} aria-hidden="true" />
      <span className="font-mono text-sm">{meta.label}</span>
      <span className="min-w-0 truncate text-xs opacity-80">{session.statusReason}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function RuntimeHealthPreview({
  tmux,
  wsl,
  isChecking,
  onRefresh,
}: {
  tmux: RuntimeHealthItem | null
  wsl: RuntimeHealthItem | null
  isChecking: boolean
  onRefresh: () => Promise<void>
}) {
  return (
    <section>
      <div className="panel-title">
        <SquareTerminal size={15} aria-hidden="true" />
        Runtime health
      </div>
      <div className="grid gap-2">
        <HealthRow label="tmux" item={tmux} />
        {wsl && <HealthRow label="WSL" item={wsl} />}
      </div>
      <button
        className="secondary-button mt-2 h-8 w-full"
        type="button"
        disabled={isChecking}
        onClick={() => void onRefresh()}
      >
        <RefreshCw size={13} aria-hidden="true" />
        {isChecking ? 'Checking' : 'Refresh health'}
      </button>
    </section>
  )
}

function HealthRow({ label, item }: { label: string; item: RuntimeHealthItem | null }) {
  const available = item?.available ?? false
  const Icon = available ? CheckCircle2 : AlertTriangle

  return (
    <div className="flex min-h-10 items-center gap-2 rounded-md border border-cyan-300/12 bg-black/20 px-3 py-2 text-xs">
      <Icon className={available ? 'text-emerald-300' : 'text-amber-300'} size={14} aria-hidden="true" />
      <span className="w-12 shrink-0 font-mono text-zinc-200">{label}</span>
      <span className="min-w-0 flex-1 truncate text-zinc-500">{item?.detail ?? 'not checked yet'}</span>
    </div>
  )
}

function PolicyPreview({ policy, source }: { policy: WatchdogPolicy; source: string }) {
  return (
    <section className="section-box">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-cyan-200">
        <span>Autopilot policy</span>
        <span className="rounded border border-cyan-300/20 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
          {source}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Soft stall" value={formatDuration(policy.softStallMs)} />
        <Metric label="Hard stall" value={formatDuration(policy.hardStallMs)} />
        <Metric label="Cooldown" value={formatDuration(policy.injectCooldownMs)} />
        <Metric label="Rules" value={policy.recoveryRules.length.toString()} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
        <span>{policy.doneMarkers.length} done</span>
        <span>{policy.waitingPatterns.length} wait</span>
        <span>{policy.blockedPatterns.length} block</span>
      </div>
    </section>
  )
}
