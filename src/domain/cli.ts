import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Circle,
  Gauge,
  Radio,
  RotateCcw,
  Settings2,
  SquareTerminal,
  StopCircle,
  TerminalSquare,
  WandSparkles,
} from 'lucide-react'
import type { CliPreset, CliSessionSnapshot, CliStatus, RunnerBackend, RunMode, ShellKind } from '../types/electron'

type IconComponent = typeof Bot

export type PresetMeta = {
  label: string
  short: string
  icon: IconComponent
  accent: string
  border: string
}

export type StatusMeta = {
  label: string
  icon: IconComponent
  className: string
}

export const presetOrder: readonly CliPreset[] = [
  'codex',
  'codex-resume',
  'claude',
  'claude-continue',
  'gemini',
  'shell',
  'wsl',
  'custom',
]

export const shellOptions: readonly ShellKind[] = ['default', 'powershell', 'cmd', 'bash', 'wsl']
export const runnerBackends: readonly RunnerBackend[] = ['pty', 'tmux']
export const runModes: readonly RunMode[] = ['manual', 'assisted', 'autopilot']

export const presetMeta: Record<CliPreset, PresetMeta> = {
  codex: {
    label: 'Codex',
    short: 'CX',
    icon: Bot,
    accent: 'text-cyan-300',
    border: 'border-cyan-400/50',
  },
  'codex-resume': {
    label: 'Codex Resume',
    short: 'CXR',
    icon: Bot,
    accent: 'text-cyan-200',
    border: 'border-cyan-300/50',
  },
  claude: {
    label: 'Claude',
    short: 'CL',
    icon: BrainCircuit,
    accent: 'text-amber-300',
    border: 'border-amber-300/50',
  },
  'claude-continue': {
    label: 'Claude Continue',
    short: 'CLC',
    icon: BrainCircuit,
    accent: 'text-orange-300',
    border: 'border-orange-300/50',
  },
  gemini: {
    label: 'Gemini',
    short: 'GM',
    icon: WandSparkles,
    accent: 'text-fuchsia-300',
    border: 'border-fuchsia-300/50',
  },
  shell: {
    label: 'Shell',
    short: 'SH',
    icon: TerminalSquare,
    accent: 'text-emerald-300',
    border: 'border-emerald-300/50',
  },
  wsl: {
    label: 'WSL',
    short: 'WSL',
    icon: SquareTerminal,
    accent: 'text-lime-300',
    border: 'border-lime-300/50',
  },
  custom: {
    label: 'Custom',
    short: 'CLI',
    icon: Settings2,
    accent: 'text-sky-300',
    border: 'border-sky-300/50',
  },
}

export const statusMeta: Record<CliStatus, StatusMeta> = {
  booting: { label: 'Booting', icon: Circle, className: 'text-slate-300 border-slate-400/40 bg-slate-400/10' },
  running: { label: 'Running', icon: Activity, className: 'text-emerald-300 border-emerald-300/40 bg-emerald-300/10' },
  waiting: { label: 'Waiting', icon: Radio, className: 'text-amber-300 border-amber-300/40 bg-amber-300/10' },
  stalled: { label: 'Stalled', icon: Gauge, className: 'text-orange-300 border-orange-300/40 bg-orange-300/10' },
  blocked: { label: 'Blocked', icon: AlertTriangle, className: 'text-rose-300 border-rose-300/40 bg-rose-300/10' },
  recovering: { label: 'Recovering', icon: RotateCcw, className: 'text-cyan-300 border-cyan-300/40 bg-cyan-300/10' },
  done: { label: 'Done', icon: CheckCircle2, className: 'text-lime-300 border-lime-300/40 bg-lime-300/10' },
  detached: { label: 'Detached', icon: Radio, className: 'text-sky-300 border-sky-300/40 bg-sky-300/10' },
  exited: { label: 'Exited', icon: StopCircle, className: 'text-zinc-300 border-zinc-300/40 bg-zinc-300/10' },
}

export const modeCopy: Record<RunMode, { label: string; detail: string; short: string }> = {
  manual: {
    label: 'Manual',
    detail: 'Open a real CLI and leave control to the human.',
    short: 'human',
  },
  assisted: {
    label: 'Assisted',
    detail: 'Observe and generate recovery suggestions on demand.',
    short: 'suggest',
  },
  autopilot: {
    label: 'Autopilot',
    detail: 'Observe and auto-inject recovery prompts after stalls.',
    short: 'auto',
  },
}

/**
 * Builds the optional supervisor prompt used only when the user explicitly enables initial prompt injection.
 */
export function defaultSupervisorPrompt(cwd: string) {
  return [
    'You are running inside a human-supervised CLI session.',
    `Working directory: ${cwd || 'current directory'}`,
    '',
    'If this is a long-running task, keep progress in .agent-supervisor/PROGRESS.md.',
    'If blocked, write .agent-supervisor/BLOCKED.flag with the reason and next possible step.',
    'If complete, write .agent-supervisor/DONE.flag and print BENCHMARK_DONE.',
    'Do not restart from scratch after recovery; inspect the current context first.',
  ].join('\n')
}

export function upsertSession(items: readonly CliSessionSnapshot[], next: CliSessionSnapshot) {
  const index = items.findIndex((item) => item.id === next.id)
  if (index === -1) return [...items, next]
  return items.map((item) => (item.id === next.id ? next : item))
}

export function parseShellKind(value: string): ShellKind {
  return shellOptions.find((item) => item === value) ?? 'default'
}

export function parseRunnerBackend(value: string): RunnerBackend {
  return runnerBackends.find((item) => item === value) ?? 'pty'
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatTime(time: number) {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
