import { useCallback, useState } from 'react'
import type { CliSessionSnapshot } from '../types/electron'

type ControlPatch = Partial<Pick<CliSessionSnapshot, 'runMode' | 'watchdogEnabled' | 'supervisorProtocol'>>

export type SessionControls = {
  manualPrompt: string
  lastExportPath: string
  setManualPrompt: (prompt: string) => void
  updateControl: (patch: ControlPatch) => Promise<void>
  injectManualPrompt: () => Promise<void>
  injectManualPromptDirect: () => Promise<void>
  copyManualPrompt: () => Promise<void>
  generateSuggestion: () => Promise<void>
  fallbackAndInject: () => Promise<void>
  injectLocalPrompt: () => Promise<void>
  submitEnter: () => Promise<void>
  exportSession: () => Promise<void>
  reattach: () => Promise<void>
}

const QUICK_CONTINUE_PROMPT = '\u7ee7\u7eed'

/**
 * Wraps high-risk session actions so UI components do not call the IPC facade directly.
 */
export function useSessionControls(
  activeSession: CliSessionSnapshot | undefined,
  onUpdated: (session: CliSessionSnapshot) => void,
): SessionControls {
  const [manualPrompt, setManualPrompt] = useState('')
  const [lastExportPath, setLastExportPath] = useState('')

  const updateControl = useCallback(
    async (patch: ControlPatch) => {
      if (!activeSession) return
      const updated = await window.cliAPI.setControl({ id: activeSession.id, ...patch })
      if (updated) onUpdated(updated)
    },
    [activeSession, onUpdated],
  )

  const injectManualPrompt = useCallback(async () => {
    if (!activeSession || !manualPrompt.trim()) return
    await window.cliAPI.injectPrompt({
      id: activeSession.id,
      prompt: manualPrompt.trim(),
      kind: 'manual_prompt',
      delivery: 'file',
    })
  }, [activeSession, manualPrompt])

  const injectManualPromptDirect = useCallback(async () => {
    if (!activeSession || !manualPrompt.trim()) return
    await window.cliAPI.injectPrompt({
      id: activeSession.id,
      prompt: manualPrompt.trim(),
      kind: 'manual_prompt',
      delivery: 'direct',
    })
  }, [activeSession, manualPrompt])

  const copyManualPrompt = useCallback(async () => {
    if (!manualPrompt.trim()) return
    await window.cliAPI.copyText(manualPrompt)
  }, [manualPrompt])

  const generateSuggestion = useCallback(async () => {
    if (!activeSession) return
    const updated = await window.cliAPI.generateFallback(activeSession.id)
    if (updated) onUpdated(updated)
  }, [activeSession, onUpdated])

  const fallbackAndInject = useCallback(async () => {
    if (!activeSession) return
    await window.cliAPI.fallbackAndInject(activeSession.id)
  }, [activeSession])

  const injectLocalPrompt = useCallback(async () => {
    if (!activeSession) return
    await window.cliAPI.injectPrompt({
      id: activeSession.id,
      prompt: QUICK_CONTINUE_PROMPT,
      kind: 'quick_continue',
      delivery: 'direct',
    })
  }, [activeSession])

  const submitEnter = useCallback(async () => {
    if (!activeSession) return
    await window.cliAPI.submitEnter(activeSession.id)
  }, [activeSession])

  const reattach = useCallback(async () => {
    if (!activeSession) return
    const updated = await window.cliAPI.reattachSession(activeSession.id)
    if (updated) onUpdated(updated)
  }, [activeSession, onUpdated])

  const exportSession = useCallback(async () => {
    if (!activeSession) return
    const result = await window.cliAPI.exportSession(activeSession.id)
    if (result) setLastExportPath(result.path)
  }, [activeSession])

  return {
    manualPrompt,
    lastExportPath,
    setManualPrompt,
    updateControl,
    injectManualPrompt,
    injectManualPromptDirect,
    copyManualPrompt,
    generateSuggestion,
    fallbackAndInject,
    injectLocalPrompt,
    submitEnter,
    exportSession,
    reattach,
  }
}
