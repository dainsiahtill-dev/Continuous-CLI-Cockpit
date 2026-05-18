import { useCallback, useEffect, useMemo, useState } from 'react'
import { upsertSession } from '../domain/cli'
import type { CliDefaults, CliSessionConfig, CliSessionSnapshot } from '../types/electron'

export type CliSessionController = {
  defaults: CliDefaults | null
  sessions: CliSessionSnapshot[]
  activeId: string
  activeSession: CliSessionSnapshot | undefined
  setActiveId: (id: string) => void
  refreshDefaults: () => Promise<CliDefaults>
  refreshSessions: () => Promise<CliSessionSnapshot[]>
  createSession: (config: CliSessionConfig) => Promise<CliSessionSnapshot>
  stopSession: (id: string) => Promise<void>
  upsertActiveSession: (session: CliSessionSnapshot) => void
}

/**
 * Owns renderer-side session snapshots and subscriptions to the Electron CLI API.
 * The Electron main process remains the source of truth.
 */
export function useCliSessions(): CliSessionController {
  const [defaults, setDefaults] = useState<CliDefaults | null>(null)
  const [sessions, setSessions] = useState<CliSessionSnapshot[]>([])
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    let mounted = true

    window.cliAPI.getDefaults().then((value) => {
      if (mounted) setDefaults(value)
    })

    window.cliAPI.listSessions().then((items) => {
      if (!mounted) return
      setSessions(items)
      setActiveId((current) => current || items[0]?.id || '')
    })

    const removeUpdate = window.cliAPI.onSessionUpdate((session) => {
      setSessions((current) => upsertSession(current, session))
      setActiveId((current) => current || session.id)
    })
    const removeEnded = window.cliAPI.onSessionEnded(({ id }) => {
      setSessions((current) => current.filter((session) => session.id !== id))
      setActiveId((current) => (current === id ? '' : current))
    })

    return () => {
      mounted = false
      removeUpdate()
      removeEnded()
    }
  }, [])

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? sessions[0],
    [activeId, sessions],
  )

  const refreshDefaults = useCallback(async () => {
    const nextDefaults = await window.cliAPI.getDefaults()
    setDefaults(nextDefaults)
    return nextDefaults
  }, [])

  const refreshSessions = useCallback(async () => {
    const items = await window.cliAPI.listSessions()
    setSessions(items)
    setActiveId((current) => current || items[0]?.id || '')
    return items
  }, [])

  const createSession = useCallback(async (config: CliSessionConfig) => {
    const session = await window.cliAPI.createSession(config)
    setSessions((current) => upsertSession(current, session))
    setActiveId(session.id)
    return session
  }, [])

  const stopSession = useCallback(
    async (id: string) => {
      await window.cliAPI.stopSession(id)
      const remaining = sessions.filter((session) => session.id !== id)
      setSessions(remaining)
      if (activeId === id) setActiveId(remaining[0]?.id || '')
    },
    [activeId, sessions],
  )

  const upsertActiveSession = useCallback((session: CliSessionSnapshot) => {
    setSessions((current) => upsertSession(current, session))
    setActiveId(session.id)
  }, [])

  return {
    defaults,
    sessions,
    activeId,
    activeSession,
    setActiveId,
    refreshDefaults,
    refreshSessions,
    createSession,
    stopSession,
    upsertActiveSession,
  }
}
