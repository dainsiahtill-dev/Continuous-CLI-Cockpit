import { useMemo, useState } from 'react'
import { defaultSupervisorPrompt, presetMeta } from '../domain/cli'
import type { CliDefaults, CliPreset, CliSessionConfig, RunnerBackend, RunMode, ShellKind } from '../types/electron'

export type LaunchFormState = {
  preset: CliPreset
  cwd: string
  title: string | null
  command: string | null
  shellKind: ShellKind | null
  runnerBackend: RunnerBackend
  runMode: RunMode
  watchdogEnabled: boolean
  supervisorProtocol: boolean
  injectInitialPrompt: boolean
  initialPrompt: string
}

export type LaunchFormDerived = {
  cwd: string
  title: string
  command: string
  shellKind: ShellKind
  prompt: string
}

export type LaunchFormController = {
  state: LaunchFormState
  derived: LaunchFormDerived
  setPreset: (preset: CliPreset) => void
  setCwd: (cwd: string) => void
  setTitle: (title: string) => void
  setCommand: (command: string) => void
  setShellKind: (shellKind: ShellKind) => void
  setRunnerBackend: (runnerBackend: RunnerBackend) => void
  setRunMode: (runMode: RunMode) => void
  setWatchdogEnabled: (enabled: boolean) => void
  setSupervisorProtocol: (enabled: boolean) => void
  setInjectInitialPrompt: (enabled: boolean) => void
  setInitialPrompt: (prompt: string) => void
  chooseDirectory: () => Promise<void>
  toConfig: () => CliSessionConfig
}

/**
 * Encapsulates the launch form's derived defaults and mode side effects.
 */
export function useLaunchForm(defaults: CliDefaults | null): LaunchFormController {
  const [state, setState] = useState<LaunchFormState>({
    preset: 'codex',
    cwd: '',
    title: null,
    command: null,
    shellKind: null,
    runnerBackend: 'pty',
    runMode: 'manual',
    watchdogEnabled: false,
    supervisorProtocol: false,
    injectInitialPrompt: false,
    initialPrompt: '',
  })

  const presetInfo = defaults?.presets[state.preset]

  const derived = useMemo<LaunchFormDerived>(() => {
    const cwd = state.cwd || defaults?.cwd || ''
    return {
      cwd,
      title: state.title ?? presetInfo?.title ?? presetMeta[state.preset].label,
      command: state.command ?? presetInfo?.command ?? '',
      shellKind: state.shellKind ?? presetInfo?.shellKind ?? 'default',
      prompt: state.initialPrompt || defaultSupervisorPrompt(cwd),
    }
  }, [defaults?.cwd, presetInfo?.command, presetInfo?.shellKind, presetInfo?.title, state])

  const setPreset = (preset: CliPreset) => {
    const nextPreset = defaults?.presets[preset]
    setState((current) => ({
      ...current,
      preset,
      title: nextPreset?.title ?? presetMeta[preset].label,
      command: nextPreset?.command ?? '',
      shellKind: nextPreset?.shellKind ?? 'default',
    }))
  }

  const setRunMode = (runMode: RunMode) => {
    setState((current) => ({
      ...current,
      runMode,
      watchdogEnabled: runMode !== 'manual',
    }))
  }

  const chooseDirectory = async () => {
    const selected = await window.cliAPI.openDirectory()
    if (selected) {
      setState((current) => ({ ...current, cwd: selected }))
    }
  }

  const toConfig = (): CliSessionConfig => ({
    preset: state.preset,
    cwd: derived.cwd,
    title: derived.title,
    command: derived.command,
    shellKind: derived.shellKind,
    runnerBackend: state.runnerBackend,
    runMode: state.runMode,
    watchdogEnabled: state.watchdogEnabled,
    supervisorProtocol: state.supervisorProtocol,
    injectInitialPrompt: state.injectInitialPrompt,
    initialPrompt: derived.prompt,
  })

  return {
    state,
    derived,
    setPreset,
    setCwd: (cwd) => setState((current) => ({ ...current, cwd })),
    setTitle: (title) => setState((current) => ({ ...current, title })),
    setCommand: (command) => setState((current) => ({ ...current, command })),
    setShellKind: (shellKind) => setState((current) => ({ ...current, shellKind })),
    setRunnerBackend: (runnerBackend) => setState((current) => ({ ...current, runnerBackend })),
    setRunMode,
    setWatchdogEnabled: (watchdogEnabled) => setState((current) => ({ ...current, watchdogEnabled })),
    setSupervisorProtocol: (supervisorProtocol) => setState((current) => ({ ...current, supervisorProtocol })),
    setInjectInitialPrompt: (injectInitialPrompt) => setState((current) => ({ ...current, injectInitialPrompt })),
    setInitialPrompt: (initialPrompt) => setState((current) => ({ ...current, initialPrompt })),
    chooseDirectory,
    toConfig,
  }
}
