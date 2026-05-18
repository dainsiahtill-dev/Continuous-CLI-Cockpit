import { Activity, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { formatTime } from '../domain/cli'
import type { CliSessionSnapshot, SessionDiagnostics } from '../types/electron'

type SessionDiagnosticsPanelProps = {
  session: CliSessionSnapshot
}

/**
 * Shows live backend diagnostics for the selected session.
 */
export function SessionDiagnosticsPanel({ session }: SessionDiagnosticsPanelProps) {
  const [diagnostics, setDiagnostics] = useState<SessionDiagnostics | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const refresh = async () => {
    setIsChecking(true)
    try {
      const result = await window.cliAPI.getDiagnostics(session.id)
      if (result) setDiagnostics(result)
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="mt-4 rounded-md border border-cyan-300/12 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
          <Activity size={14} aria-hidden="true" />
          Session diagnostics
        </div>
        <button className="tool-button px-3" type="button" disabled={isChecking} onClick={refresh}>
          <RefreshCw size={13} aria-hidden="true" />
          {isChecking ? 'Checking' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <DiagnosticMetric label="Runner" value={diagnostics?.runnerBackend ?? session.runnerBackend} />
        <DiagnosticMetric label="Attached" value={(diagnostics?.attached ?? session.attached) ? 'yes' : 'no'} />
        <DiagnosticMetric label="tmux alive" value={formatNullableBoolean(diagnostics?.tmuxAlive)} />
        <DiagnosticMetric label="clients" value={formatNullableNumber(diagnostics?.tmuxAttachedClients)} />
        <DiagnosticMetric label="panes" value={formatNullableNumber(diagnostics?.tmuxPaneCount)} />
        <DiagnosticMetric label="checked" value={diagnostics ? formatTime(diagnostics.checkedAt) : 'never'} />
      </div>

      <div className="mt-2 rounded-md border border-white/10 bg-black/25 p-2 text-xs text-zinc-400">
        {diagnostics?.detail ?? 'Diagnostics have not been checked yet.'}
      </div>

      {diagnostics?.tmuxSessionName && (
        <div className="mt-2 break-all font-mono text-[11px] text-zinc-500">{diagnostics.tmuxSessionName}</div>
      )}

      {diagnostics?.tmuxLastLine && (
        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/35 p-2 text-[11px] text-zinc-300">
          {diagnostics.tmuxLastLine}
        </pre>
      )}

      {diagnostics?.tmuxCaptureTail && (
        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/35 p-2 font-mono text-[11px] leading-5 text-zinc-400">
          {diagnostics.tmuxCaptureTail}
        </pre>
      )}
    </div>
  )
}

function DiagnosticMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatNullableBoolean(value: boolean | null | undefined) {
  if (value === null || value === undefined) return 'n/a'
  return value ? 'yes' : 'no'
}

function formatNullableNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return 'n/a'
  return value.toString()
}
