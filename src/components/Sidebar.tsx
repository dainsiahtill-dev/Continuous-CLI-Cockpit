import clsx from 'clsx'
import { Activity, ChevronLeft, RotateCcw, SquareTerminal } from 'lucide-react'
import { presetMeta, statusMeta } from '../domain/cli'
import type { CliSessionSnapshot } from '../types/electron'

type SidebarProps = {
  sessions: CliSessionSnapshot[]
  activeId: string
  collapsed: boolean
  onToggle: () => void
  onActivate: (id: string) => void
}

export function Sidebar({ sessions, activeId, collapsed, onToggle, onActivate }: SidebarProps) {
  const activeCount = sessions.filter((session) => !['done', 'exited'].includes(session.status)).length

  return (
    <aside
      className={clsx(
        'flex shrink-0 flex-col border-r border-cyan-400/20 bg-[#070b10] transition-[width] duration-300',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-cyan-400/10 px-4">
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold text-cyan-200">Control Plane</div>
            <div className="text-xs text-zinc-500">{activeCount} active sessions</div>
          </div>
        )}
        <button className="icon-button" type="button" aria-label="Toggle sidebar" onClick={onToggle}>
          <ChevronLeft
            size={18}
            className={clsx('transition-transform', collapsed && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <button
          className={clsx('nav-row text-cyan-200', collapsed && 'justify-center px-0')}
          type="button"
          aria-label="Sessions"
        >
          <SquareTerminal size={20} aria-hidden="true" />
          {!collapsed && <span>Sessions</span>}
        </button>
        <button className={clsx('nav-row', collapsed && 'justify-center px-0')} type="button" aria-label="Recovery">
          <RotateCcw size={20} aria-hidden="true" />
          {!collapsed && <span>Recovery</span>}
        </button>
        <button className={clsx('nav-row', collapsed && 'justify-center px-0')} type="button" aria-label="Timeline">
          <Activity size={20} aria-hidden="true" />
          {!collapsed && <span>Timeline</span>}
        </button>

        <div className="mx-4 my-3 h-px bg-cyan-400/10" />

        <div className="space-y-1 px-2">
          {sessions.map((session) => {
            const meta = presetMeta[session.preset]
            const PresetIcon = meta.icon
            const StatusIcon = statusMeta[session.status].icon
            return (
              <button
                key={session.id}
                className={clsx('session-row', activeId === session.id && 'active', collapsed && 'justify-center px-0')}
                type="button"
                onClick={() => onActivate(session.id)}
                aria-label={`Open ${session.title}`}
                title={session.title}
              >
                <span
                  className={clsx(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-black/30',
                    meta.border,
                  )}
                >
                  <PresetIcon size={16} className={meta.accent} aria-hidden="true" />
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm text-zinc-100">{session.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                      <StatusIcon size={12} aria-hidden="true" />
                      {session.runMode} / {statusMeta[session.status].label}
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="m-4 flex h-12 shrink-0 items-center gap-3 rounded-md border border-emerald-300/20 bg-emerald-300/5 px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.7)]" />
        {!collapsed && <span className="text-xs text-zinc-300">PTY bridge online</span>}
      </div>
    </aside>
  )
}
