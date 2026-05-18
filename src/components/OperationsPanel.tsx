import { Archive, Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import type { CliDefaults, CliSessionSnapshot, WatchdogPolicy } from '../types/electron'

type OperationsPanelProps = {
  onDefaultsUpdated: () => Promise<CliDefaults>
  onSessionsUpdated: () => Promise<CliSessionSnapshot[]>
  onPolicyUpdated: (policy: WatchdogPolicy) => void
}

/**
 * Provides import/export and cleanup actions that affect app-level state.
 */
export function OperationsPanel({ onDefaultsUpdated, onSessionsUpdated, onPolicyUpdated }: OperationsPanelProps) {
  const [message, setMessage] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const run = async (action: () => Promise<string>) => {
    setIsRunning(true)
    try {
      setMessage(await action())
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="mb-5 border-b border-cyan-300/10 pb-5">
      <div className="panel-title">
        <Archive size={15} aria-hidden="true" />
        Operations
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="tool-button"
          type="button"
          disabled={isRunning}
          onClick={() =>
            void run(async () => {
              const result = await window.cliAPI.exportPresets()
              return `Presets exported: ${result.path}`
            })
          }
        >
          <Download size={14} aria-hidden="true" />
          Export presets
        </button>
        <button
          className="tool-button"
          type="button"
          disabled={isRunning}
          onClick={() =>
            void run(async () => {
              const result = await window.cliAPI.importPresets()
              if (!result.ok) return result.errors.join(' ')
              await onDefaultsUpdated()
              return 'Presets imported.'
            })
          }
        >
          <Upload size={14} aria-hidden="true" />
          Import presets
        </button>
        <button
          className="tool-button"
          type="button"
          disabled={isRunning}
          onClick={() =>
            void run(async () => {
              await window.cliAPI.resetPresets()
              await onDefaultsUpdated()
              return 'Presets reset.'
            })
          }
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset presets
        </button>
        <button
          className="tool-button"
          type="button"
          disabled={isRunning}
          onClick={() =>
            void run(async () => {
              const result = await window.cliAPI.exportPolicy()
              return `Policy exported: ${result.path}`
            })
          }
        >
          <Download size={14} aria-hidden="true" />
          Export policy
        </button>
        <button
          className="tool-button"
          type="button"
          disabled={isRunning}
          onClick={() =>
            void run(async () => {
              const result = await window.cliAPI.importPolicy()
              if (!result.ok) return result.errors.join(' ')
              onPolicyUpdated(result.policy)
              await onDefaultsUpdated()
              return 'Policy imported.'
            })
          }
        >
          <Upload size={14} aria-hidden="true" />
          Import policy
        </button>
        <button
          className="tool-button"
          type="button"
          disabled={isRunning}
          onClick={() =>
            void run(async () => {
              const result = await window.cliAPI.archiveEndedSessions()
              await onSessionsUpdated()
              return result.path
                ? `Archived ${result.count} ended sessions: ${result.path}`
                : `Archived ${result.count} ended sessions.`
            })
          }
        >
          <Archive size={14} aria-hidden="true" />
          Archive ended
        </button>
        <button
          className="tool-button danger"
          type="button"
          disabled={isRunning}
          onClick={() =>
            void run(async () => {
              const result = await window.cliAPI.clearEndedSessions()
              await onSessionsUpdated()
              return `Cleared ${result.count} ended sessions.`
            })
          }
        >
          <Trash2 size={14} aria-hidden="true" />
          Clear ended
        </button>
      </div>
      {message && (
        <div className="mt-2 break-all rounded-md border border-white/10 bg-black/25 p-2 text-xs text-zinc-400">
          {message}
        </div>
      )}
    </div>
  )
}
