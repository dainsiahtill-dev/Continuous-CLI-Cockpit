import clsx from 'clsx'
import { Pencil, SquareTerminal, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { presetMeta } from '../domain/cli'
import type { CliSessionSnapshot } from '../types/electron'

type SessionTabsProps = {
  sessions: CliSessionSnapshot[]
  activeId: string
  onActivate: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onStop: (id: string) => void
}

export function SessionTabs({ sessions, activeId, onActivate, onRename, onStop }: SessionTabsProps) {
  const [editingId, setEditingId] = useState('')
  const [draftTitle, setDraftTitle] = useState('')

  const startRename = (session: CliSessionSnapshot) => {
    setEditingId(session.id)
    setDraftTitle(session.title)
    onActivate(session.id)
  }

  const cancelRename = () => {
    setEditingId('')
    setDraftTitle('')
  }

  const submitRename = async (session: CliSessionSnapshot) => {
    const nextTitle = draftTitle.trim()
    cancelRename()
    if (!nextTitle || nextTitle === session.title) return
    await onRename(session.id, nextTitle)
  }

  return (
    <div className="flex h-14 shrink-0 items-end border-b border-cyan-400/20 bg-[#091018] px-3">
      <div className="flex h-full items-end gap-1 overflow-x-auto">
        {sessions.length === 0 && (
          <div className="mb-3 flex items-center gap-2 text-sm text-zinc-500">
            <SquareTerminal size={16} aria-hidden="true" />
            No running sessions
          </div>
        )}
        {sessions.map((session) => {
          const meta = presetMeta[session.preset]
          const PresetIcon = meta.icon
          const isActive = session.id === activeId
          const isEditing = session.id === editingId
          return (
            <div key={session.id} className={clsx('tui-tab group', isActive && 'active')}>
              {isEditing ? (
                <form
                  className="flex min-w-0 flex-1 items-center"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault()
                    void submitRename(session)
                  }}
                >
                  <input
                    autoFocus
                    className="tab-title-input"
                    value={draftTitle}
                    onBlur={() => void submitRename(session)}
                    onChange={(event) => setDraftTitle(event.currentTarget.value)}
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === 'Escape') cancelRename()
                    }}
                  />
                </form>
              ) : (
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onActivate(session.id)}
                  onDoubleClick={() => startRename(session)}
                >
                  <PresetIcon size={16} className={meta.accent} aria-hidden="true" />
                  <span className="truncate">{session.title}</span>
                  <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {meta.short}
                  </span>
                </button>
              )}
              {!isEditing && (
                <button
                  className="rounded p-0.5 text-zinc-500 opacity-0 transition-opacity hover:bg-cyan-300/10 hover:text-cyan-100 group-hover:opacity-100 focus:opacity-100"
                  type="button"
                  aria-label={`Rename ${session.title}`}
                  onClick={() => startRename(session)}
                >
                  <Pencil size={13} aria-hidden="true" />
                </button>
              )}
              <button
                className="rounded p-0.5 text-zinc-500 opacity-0 transition-opacity hover:bg-rose-300/10 hover:text-rose-200 group-hover:opacity-100 focus:opacity-100"
                type="button"
                aria-label={`Close ${session.title}`}
                onClick={() => onStop(session.id)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
