import '@xterm/xterm/css/xterm.css'
import clsx from 'clsx'
import { Copy, TerminalSquare } from 'lucide-react'
import { useState } from 'react'
import { statusMeta } from '../domain/cli'
import { useTerminalBridge } from '../hooks/useTerminalBridge'
import type { CliSessionSnapshot } from '../types/electron'

type TerminalPaneProps = {
  session: CliSessionSnapshot
}

export function TerminalPane({ session }: TerminalPaneProps) {
  const { containerRef, copySelection } = useTerminalBridge(session)
  const [copyLabel, setCopyLabel] = useState('Copy')
  const meta = statusMeta[session.status]
  const StatusIcon = meta.icon
  const hasVisibleOutput = session.outputTail.trim().length > 0

  const copyTerminalText = async () => {
    const selected = copySelection()
    const text = selected || session.outputTail
    if (!text.trim()) return
    await window.cliAPI.copyText(text)
    setCopyLabel(selected ? 'Copied selection' : 'Copied output')
    window.setTimeout(() => setCopyLabel('Copy'), 1500)
  }

  return (
    <section className="terminal-shell scanlines flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-cyan-300/50 bg-black shadow-[0_0_28px_rgba(34,211,238,0.16)]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-cyan-300/20 bg-[#061016] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <TerminalSquare size={16} className="text-cyan-200" aria-hidden="true" />
          <span className="truncate font-mono text-sm text-cyan-100">{session.title}</span>
          <span className={clsx('status-pill', meta.className)}>
            <StatusIcon size={12} aria-hidden="true" />
            {meta.label}
          </span>
          <span className="rounded border border-white/10 px-2 py-1 text-[11px] text-zinc-400">{session.runMode}</span>
          <span className="rounded border border-white/10 px-2 py-1 text-[11px] text-zinc-400">
            {session.runnerBackend}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 pl-3">
          <div className="truncate text-xs text-zinc-500">{session.cwd}</div>
          <button
            className="terminal-copy-button"
            type="button"
            title="Copy selected terminal text, or copy current output if nothing is selected"
            onClick={() => void copyTerminalText()}
          >
            <Copy size={13} aria-hidden="true" />
            <span>{copyLabel}</span>
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 p-3">
        <div ref={containerRef} className="h-full w-full overflow-hidden" />
        {!hasVisibleOutput && (
          <div className="pointer-events-none absolute inset-3 grid place-items-center">
            <div className="max-w-md rounded-md border border-cyan-300/15 bg-black/70 p-4 text-center shadow-[0_0_24px_rgba(34,211,238,0.12)]">
              <div className="font-mono text-sm text-cyan-100">Waiting for terminal output</div>
              <div className="mt-2 text-xs leading-5 text-zinc-500">
                The session is attached, but no visible output has arrived yet. For tmux sessions, check Runtime health
                and Session diagnostics if this stays blank.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export function EmptyTerminal() {
  return (
    <section className="scanlines flex min-h-0 flex-1 items-center justify-center rounded-md border border-cyan-300/30 bg-black/70">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-md border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
          <TerminalSquare size={28} aria-hidden="true" />
        </div>
        <div className="font-mono text-base text-zinc-200">No active CLI session</div>
        <div className="text-sm text-zinc-500">Start any command from the cockpit panel</div>
      </div>
    </section>
  )
}
