import clsx from 'clsx'
import { CheckCircle2, Eye, FileInput, PauseCircle, Radar, RotateCcw, ShieldAlert, Timer } from 'lucide-react'
import { formatDuration, formatTime } from '../domain/cli'
import type { CliEvent, CliSessionSnapshot, WatchdogPolicy } from '../types/electron'

type AutopilotPipelineProps = {
  cooldown: number
  now: number
  onInterrupt: () => Promise<void>
  policy: WatchdogPolicy | null
  session: CliSessionSnapshot
}

type PipelinePhase = 'observe' | 'evaluate' | 'resolve' | 'inject' | 'cooldown' | 'completed' | 'standby'
type StepState = 'done' | 'active' | 'pending'

const pipelineSteps: readonly {
  phase: Exclude<PipelinePhase, 'completed' | 'standby'>
  label: string
  icon: typeof Eye
}[] = [
  { phase: 'observe', label: 'Observe', icon: Eye },
  { phase: 'evaluate', label: 'Evaluate', icon: Radar },
  { phase: 'resolve', label: 'Resolve', icon: RotateCcw },
  { phase: 'inject', label: 'Inject', icon: FileInput },
  { phase: 'cooldown', label: 'Cooldown', icon: Timer },
]

/**
 * Renders Autopilot as a transparent state machine instead of a hidden background loop.
 */
export function AutopilotPipeline({ cooldown, now, onInterrupt, policy, session }: AutopilotPipelineProps) {
  const model = buildAutopilotModel(session, policy, cooldown, now)
  const PhaseIcon = model.icon
  const latestInjection = latestEvent(session.events, 'prompt-injected')
  const interruptDisabled = session.runMode === 'manual' && !session.watchdogEnabled

  return (
    <section className={clsx('autopilot-panel', `phase-${model.phase}`)} aria-label="Autopilot pipeline">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PhaseIcon size={15} aria-hidden="true" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-cyan-100">{model.title}</div>
            <div className="truncate text-[11px] text-zinc-500">{model.subtitle}</div>
          </div>
        </div>
        <button
          className="autopilot-interrupt"
          type="button"
          disabled={interruptDisabled}
          onClick={() => void onInterrupt()}
        >
          <PauseCircle size={13} aria-hidden="true" />
          Interrupt
        </button>
      </div>

      <div className="autopilot-steps">
        {pipelineSteps.map((step) => {
          const state = stepState(step.phase, model.phase)
          const Icon = step.icon
          return (
            <div key={step.phase} className={clsx('autopilot-step', state)}>
              <div className="autopilot-node">
                <Icon size={13} aria-hidden="true" />
              </div>
              <span>{step.label}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <ShieldAlert size={13} aria-hidden="true" />
          <span>{model.reason}</span>
        </div>
        <div className="mt-1 text-[11px] text-zinc-600">{model.detail}</div>
      </div>

      {latestInjection?.detail && (
        <div className="mt-2 truncate rounded-md border border-fuchsia-300/15 bg-fuchsia-300/5 px-2 py-1 font-mono text-[11px] text-fuchsia-100">
          Last injected prompt: {latestInjection.detail}
        </div>
      )}
    </section>
  )
}

function buildAutopilotModel(
  session: CliSessionSnapshot,
  policy: WatchdogPolicy | null,
  cooldown: number,
  now: number,
) {
  if (session.status === 'done') {
    return {
      phase: 'completed' as const,
      icon: CheckCircle2,
      title: 'Autopilot completed',
      subtitle: 'Done marker detected',
      reason: session.statusReason,
      detail: 'The watchdog will not attempt further recovery for this session.',
    }
  }

  if (session.runMode !== 'autopilot' || !session.watchdogEnabled) {
    return {
      phase: 'standby' as const,
      icon: PauseCircle,
      title: 'Autopilot standby',
      subtitle: 'Manual control is active',
      reason: 'Autopilot will not inject prompts until mode and watchdog are enabled.',
      detail: 'Use Autopilot only when automatic continuation is acceptable.',
    }
  }

  const injectedRecently = session.lastInjectAt > 0 && now - session.lastInjectAt < 10_000
  if (injectedRecently) {
    return {
      phase: 'inject' as const,
      icon: FileInput,
      title: 'Injected recovery prompt',
      subtitle: 'Sending prompt directly',
      reason: latestEvent(session.events, 'prompt-injected')?.message ?? 'Prompt was injected.',
      detail: 'The primary CLI remains the only executor.',
    }
  }

  if (cooldown > 0 && session.lastInjectAt > 0) {
    return {
      phase: 'cooldown' as const,
      icon: Timer,
      title: 'Autopilot cooldown',
      subtitle: `Next auto-injection in ${formatDuration(cooldown)}`,
      reason:
        latestEvent(session.events, 'recovery-skipped')?.message ?? 'Cooldown prevents repeated prompt injection.',
      detail: `Last injection: ${formatTime(session.lastInjectAt)}. Cooldown policy: ${formatDuration(
        policy?.injectCooldownMs ?? 0,
      )}.`,
    }
  }

  if (session.status === 'recovering') {
    const fallbackEvent = latestEvent(session.events, 'fallback-start')
    return {
      phase: 'resolve' as const,
      icon: RotateCcw,
      title: session.statusReason.includes('fallback') ? 'Resolving with fallback' : 'Resolving locally',
      subtitle: fallbackEvent ? 'Generating fallback prompt' : 'Preparing recovery prompt',
      reason: session.statusReason,
      detail: fallbackEvent?.message ?? 'A recovery prompt is being prepared before injection.',
    }
  }

  if (session.status === 'waiting' || session.status === 'stalled' || session.status === 'blocked') {
    return {
      phase: 'evaluate' as const,
      icon: Radar,
      title: 'Evaluating terminal state',
      subtitle: statusSubtitle(session.status),
      reason: session.statusReason,
      detail: `Idle ${formatDuration(now - session.lastOutputAt)}. Local retries ${session.localRetry}/${
        policy?.maxLocalContinueRetry ?? 0
      }.`,
    }
  }

  return {
    phase: 'observe' as const,
    icon: Eye,
    title: 'Observing terminal',
    subtitle: `Watchdog checks every ${formatDuration(policy?.checkIntervalMs ?? 0)}`,
    reason: session.statusReason || 'Terminal running smoothly.',
    detail: `Idle ${formatDuration(now - session.lastOutputAt)}. No recovery action is pending.`,
  }
}

function statusSubtitle(status: CliSessionSnapshot['status']) {
  if (status === 'waiting') return 'Waiting pattern detected'
  if (status === 'stalled') return 'Soft idle timeout detected'
  if (status === 'blocked') return 'Blocked state detected'
  return 'State requires review'
}

function latestEvent(events: readonly CliEvent[], type: string) {
  return events.find((event) => event.type === type)
}

function stepState(step: Exclude<PipelinePhase, 'completed' | 'standby'>, phase: PipelinePhase): StepState {
  if (phase === 'completed') return 'done'
  if (phase === 'standby') return 'pending'
  const activeIndex = pipelineSteps.findIndex((item) => item.phase === phase)
  const stepIndex = pipelineSteps.findIndex((item) => item.phase === step)
  if (stepIndex < activeIndex) return 'done'
  if (stepIndex === activeIndex) return 'active'
  return 'pending'
}
