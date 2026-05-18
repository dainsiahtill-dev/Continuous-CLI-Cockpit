import clsx from 'clsx'
import { AlertTriangle, Cpu, FolderOpen, GitBranch, Play, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import {
  modeCopy,
  parseRunnerBackend,
  parseShellKind,
  presetMeta,
  presetOrder,
  runnerBackends,
  shellOptions,
} from '../domain/cli'
import { useLaunchForm } from '../hooks/useLaunchForm'
import type { CliDefaults, CliSessionConfig, CliSessionSnapshot, RuntimeHealthItem } from '../types/electron'
import { RunModeSelector } from './RunModeSelector'

type LaunchPanelProps = {
  defaults: CliDefaults | null
  onCreate: (config: CliSessionConfig) => Promise<CliSessionSnapshot>
  tmuxHealth: RuntimeHealthItem | null
}

export function LaunchPanel({ defaults, onCreate, tmuxHealth }: LaunchPanelProps) {
  const form = useLaunchForm(defaults)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const tmuxUnavailable = form.state.runnerBackend === 'tmux' && tmuxHealth?.available === false

  const create = async () => {
    if (tmuxUnavailable) {
      setStartError(tmuxHealth.detail)
      return
    }
    setIsStarting(true)
    setStartError('')
    try {
      await onCreate(form.toConfig())
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Failed to start CLI session.')
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title">
          <Cpu size={15} aria-hidden="true" />
          Run anything
        </div>
        <div className="grid grid-cols-4 gap-2">
          {presetOrder.map((item) => {
            const meta = presetMeta[item]
            const PresetIcon = meta.icon
            return (
              <button
                key={item}
                className={clsx('provider-button', form.state.preset === item && 'active')}
                type="button"
                aria-pressed={form.state.preset === item}
                onClick={() => form.setPreset(item)}
              >
                <PresetIcon size={17} className={meta.accent} aria-hidden="true" />
                <span>{meta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="panel-title">
          <Sparkles size={15} aria-hidden="true" />
          Control mode
        </div>
        <RunModeSelector value={form.state.runMode} onChange={form.setRunMode} />
        <p className="mt-2 text-xs leading-5 text-zinc-500">{modeCopy[form.state.runMode].detail}</p>
      </div>

      <label className="field-label">
        Session name
        <input
          className="field-input"
          value={form.derived.title}
          onChange={(event) => form.setTitle(event.target.value)}
        />
      </label>

      <label className="field-label">
        Working directory
        <div className="flex gap-2">
          <input
            className="field-input min-w-0 flex-1 font-mono"
            value={form.derived.cwd}
            onChange={(event) => form.setCwd(event.target.value)}
          />
          <button
            className="icon-button shrink-0"
            type="button"
            aria-label="Choose working directory"
            onClick={form.chooseDirectory}
          >
            <FolderOpen size={16} aria-hidden="true" />
          </button>
        </div>
      </label>

      <label className="field-label">
        Shell backend
        <select
          className="field-input"
          value={form.derived.shellKind}
          onChange={(event) => form.setShellKind(parseShellKind(event.target.value))}
        >
          {shellOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        Runner backend
        <select
          className="field-input"
          value={form.state.runnerBackend}
          onChange={(event) => {
            setStartError('')
            form.setRunnerBackend(parseRunnerBackend(event.target.value))
          }}
        >
          {runnerBackends.map((backend) => (
            <option key={backend} value={backend}>
              {backend === 'pty'
                ? 'pty attached'
                : `tmux detached${tmuxHealth?.available === false ? ' (unavailable)' : ''}`}
            </option>
          ))}
        </select>
      </label>

      {tmuxUnavailable && (
        <div className="runtime-warning">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{tmuxHealth.detail}</span>
        </div>
      )}

      <label className="field-label">
        Command
        <textarea
          className="field-textarea h-16 font-mono"
          placeholder="Leave empty to open only the shell"
          value={form.derived.command}
          onChange={(event) => form.setCommand(event.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="toggle-row">
          <span>
            <ShieldCheck size={15} className="text-emerald-300" aria-hidden="true" />
            Watchdog
          </span>
          <input
            checked={form.state.watchdogEnabled}
            type="checkbox"
            onChange={(event) => form.setWatchdogEnabled(event.target.checked)}
          />
        </label>
        <label className="toggle-row">
          <span>
            <GitBranch size={15} className="text-cyan-300" aria-hidden="true" />
            Supervisor files
          </span>
          <input
            checked={form.state.supervisorProtocol}
            type="checkbox"
            onChange={(event) => form.setSupervisorProtocol(event.target.checked)}
          />
        </label>
      </div>

      <label className="toggle-row">
        <span>
          <Send size={15} className="text-fuchsia-300" aria-hidden="true" />
          Inject initial prompt
        </span>
        <input
          checked={form.state.injectInitialPrompt}
          type="checkbox"
          onChange={(event) => form.setInjectInitialPrompt(event.target.checked)}
        />
      </label>

      {form.state.injectInitialPrompt && (
        <label className="field-label">
          Initial prompt
          <textarea
            className="field-textarea h-28"
            value={form.derived.prompt}
            onChange={(event) => form.setInitialPrompt(event.target.value)}
          />
        </label>
      )}

      {startError && (
        <div className="runtime-warning">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{startError}</span>
        </div>
      )}

      <button className="primary-button h-10" type="button" disabled={isStarting || tmuxUnavailable} onClick={create}>
        <Play size={16} aria-hidden="true" />
        {isStarting ? 'Starting' : 'Start CLI'}
      </button>
    </div>
  )
}
