import { AlertTriangle, RotateCcw, Save, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDuration } from '../domain/cli'
import type { RecoveryAction, RecoveryRule, RecoveryState, WatchdogPolicy } from '../types/electron'

type PolicyEditorProps = {
  hasSessionPolicyOverride: boolean
  scopeCwd: string | undefined
  scopeSessionId: string | undefined
  policy: WatchdogPolicy
  onSaved: (policy: WatchdogPolicy) => void
}

type RecoveryRuleDraft = {
  id: string
  label: string
  state: RecoveryState
  action: RecoveryAction
  enabled: boolean
  priority: string
  maxRetries: string
  prompt: string
  resumeCommand: string
}

type PolicyDraft = {
  checkIntervalMs: string
  softStallMs: string
  hardStallMs: string
  injectCooldownMs: string
  maxLocalContinueRetry: string
  outputTailLimit: string
  doneMarkers: string
  waitingPatterns: string
  blockedPatterns: string
  recoveryRules: RecoveryRuleDraft[]
  circuitBreakerEnabled: boolean
  circuitBreakerWindowMs: string
  circuitBreakerMaxRecoveries: string
  manualInterventionPatterns: string
}

const recoveryStates: readonly RecoveryState[] = [
  'manual_intervention',
  'exited',
  'blocked',
  'hard_stall',
  'waiting',
  'soft_stall',
]
const recoveryActions: readonly RecoveryAction[] = [
  'interrupt',
  'auto_resume',
  'trigger_fallback_agent',
  'inject_local_prompt',
]

const stateLabels: Record<RecoveryState, string> = {
  blocked: 'Blocked',
  exited: 'Exited',
  hard_stall: 'Hard stall',
  manual_intervention: 'Manual stop',
  soft_stall: 'Soft stall',
  waiting: 'Waiting',
}

const actionLabels: Record<RecoveryAction, string> = {
  auto_resume: 'Auto resume',
  inject_local_prompt: 'Inject prompt',
  interrupt: 'Interrupt',
  trigger_fallback_agent: 'Fallback agent',
}

/**
 * Edits the watchdog policy, including state-to-action recovery routing.
 */
export function PolicyEditor({
  hasSessionPolicyOverride,
  policy,
  scopeCwd,
  scopeSessionId,
  onSaved,
}: PolicyEditorProps) {
  const [draft, setDraft] = useState(() => toDraft(policy))
  const [errors, setErrors] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const preview = useMemo(() => toPolicy(draft), [draft])

  const save = async () => {
    const nextPolicy = toPolicy(draft)
    const localErrors = validatePolicyDraft(nextPolicy)
    if (localErrors.length > 0) {
      setErrors(localErrors)
      return
    }

    setIsSaving(true)
    try {
      const result = await window.cliAPI.setPolicy(
        scopeSessionId
          ? { sessionId: scopeSessionId, policy: nextPolicy }
          : scopeCwd
            ? { cwd: scopeCwd, policy: nextPolicy }
            : nextPolicy,
      )
      if (result.ok) {
        setErrors([])
        setDraft(toDraft(result.policy))
        onSaved(result.policy)
      } else {
        setErrors(result.errors)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const saveToProject = async () => {
    if (!scopeCwd) return
    const nextPolicy = toPolicy(draft)
    const localErrors = validatePolicyDraft(nextPolicy)
    if (localErrors.length > 0) {
      setErrors(localErrors)
      return
    }

    setIsSaving(true)
    try {
      const result = await window.cliAPI.setPolicy({ cwd: scopeCwd, policy: nextPolicy })
      if (!result.ok) {
        setErrors(result.errors)
        return
      }
      const promoted = scopeSessionId ? await window.cliAPI.resetPolicy({ sessionId: scopeSessionId }) : result.policy
      setErrors([])
      setDraft(toDraft(promoted))
      onSaved(promoted)
    } finally {
      setIsSaving(false)
    }
  }

  const reloadFromParent = async () => {
    setIsSaving(true)
    try {
      const nextPolicy = await window.cliAPI.resetPolicy(
        scopeSessionId ? { sessionId: scopeSessionId } : scopeCwd ? { cwd: scopeCwd } : undefined,
      )
      setErrors([])
      setDraft(toDraft(nextPolicy))
      onSaved(nextPolicy)
    } finally {
      setIsSaving(false)
    }
  }

  const updateRule = (index: number, patch: Partial<RecoveryRuleDraft>) => {
    setDraft((current) => ({
      ...current,
      recoveryRules: current.recoveryRules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    }))
  }

  return (
    <div className="mt-4 rounded-md border border-cyan-300/12 bg-black/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-200">
        <ShieldAlert size={14} aria-hidden="true" />
        {scopeSessionId
          ? hasSessionPolicyOverride
            ? 'Session override policy'
            : 'Project synced policy'
          : scopeCwd
            ? 'Project autopilot policy'
            : 'Default autopilot policy'}
      </div>
      {scopeCwd && <div className="mb-3 truncate font-mono text-[11px] text-zinc-500">{scopeCwd}</div>}

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Check ms"
          value={draft.checkIntervalMs}
          onChange={(value) => setDraft((current) => ({ ...current, checkIntervalMs: value }))}
        />
        <NumberField
          label="Cooldown ms"
          value={draft.injectCooldownMs}
          onChange={(value) => setDraft((current) => ({ ...current, injectCooldownMs: value }))}
        />
        <NumberField
          label="Soft stall ms"
          value={draft.softStallMs}
          onChange={(value) => setDraft((current) => ({ ...current, softStallMs: value }))}
        />
        <NumberField
          label="Hard stall ms"
          value={draft.hardStallMs}
          onChange={(value) => setDraft((current) => ({ ...current, hardStallMs: value }))}
        />
        <NumberField
          label="Legacy local tries"
          value={draft.maxLocalContinueRetry}
          onChange={(value) => setDraft((current) => ({ ...current, maxLocalContinueRetry: value }))}
        />
        <NumberField
          label="Tail chars"
          value={draft.outputTailLimit}
          onChange={(value) => setDraft((current) => ({ ...current, outputTailLimit: value }))}
        />
      </div>

      <ListField
        label="Done markers"
        value={draft.doneMarkers}
        onChange={(value) => setDraft((current) => ({ ...current, doneMarkers: value }))}
      />
      <ListField
        label="Waiting regex"
        value={draft.waitingPatterns}
        onChange={(value) => setDraft((current) => ({ ...current, waitingPatterns: value }))}
      />
      <ListField
        label="Blocked regex"
        value={draft.blockedPatterns}
        onChange={(value) => setDraft((current) => ({ ...current, blockedPatterns: value }))}
      />

      <div className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/5 p-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-amber-100">
          <input
            type="checkbox"
            checked={draft.circuitBreakerEnabled}
            onChange={(event) =>
              setDraft((current) => ({ ...current, circuitBreakerEnabled: event.currentTarget.checked }))
            }
          />
          Circuit breaker
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField
            label="Window ms"
            value={draft.circuitBreakerWindowMs}
            onChange={(value) => setDraft((current) => ({ ...current, circuitBreakerWindowMs: value }))}
          />
          <NumberField
            label="Max actions"
            value={draft.circuitBreakerMaxRecoveries}
            onChange={(value) => setDraft((current) => ({ ...current, circuitBreakerMaxRecoveries: value }))}
          />
        </div>
        <ListField
          label="Manual stop regex"
          value={draft.manualInterventionPatterns}
          onChange={(value) => setDraft((current) => ({ ...current, manualInterventionPatterns: value }))}
        />
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-xs font-semibold text-cyan-200">Recovery routing</div>
        {draft.recoveryRules.map((rule, index) => (
          <div key={`${rule.id}-${index}`} className="rounded-md border border-white/10 bg-black/25 p-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-zinc-200">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => updateRule(index, { enabled: event.currentTarget.checked })}
                />
                <span className="truncate">{rule.label}</span>
              </label>
              <span className="shrink-0 rounded border border-cyan-300/20 px-1.5 py-0.5 text-[10px] text-cyan-100">
                {stateLabels[rule.state]}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <SelectField
                label="State"
                value={rule.state}
                options={recoveryStates}
                labels={stateLabels}
                onChange={(value) => updateRule(index, { state: value })}
              />
              <SelectField
                label="Action"
                value={rule.action}
                options={recoveryActions}
                labels={actionLabels}
                onChange={(value) => updateRule(index, { action: value })}
              />
              <NumberField
                label="Priority"
                value={rule.priority}
                onChange={(value) => updateRule(index, { priority: value })}
              />
              <NumberField
                label="Max tries"
                value={rule.maxRetries}
                onChange={(value) => updateRule(index, { maxRetries: value })}
              />
            </div>

            {rule.action === 'auto_resume' && (
              <label className="field-label mt-2">
                Resume command
                <input
                  className="field-input font-mono"
                  placeholder="codex resume --last"
                  value={rule.resumeCommand}
                  onChange={(event) => updateRule(index, { resumeCommand: event.currentTarget.value })}
                />
              </label>
            )}

            {rule.action !== 'interrupt' && (
              <label className="field-label mt-2">
                Prompt template
                <textarea
                  className="field-textarea h-24 font-mono"
                  value={rule.prompt}
                  onChange={(event) => updateRule(index, { prompt: event.currentTarget.value })}
                />
              </label>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 rounded-md border border-white/10 bg-black/20 p-2 text-[11px] text-zinc-400">
        Soft {formatDuration(preview.softStallMs)} / Hard {formatDuration(preview.hardStallMs)} / Cooldown{' '}
        {formatDuration(preview.injectCooldownMs)} / Circuit {formatDuration(preview.circuitBreaker.windowMs)}
      </div>

      {errors.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-300/25 bg-amber-300/8 p-2 text-xs text-amber-100">
          <div className="mb-1 flex items-center gap-1 font-semibold text-amber-200">
            <AlertTriangle size={13} aria-hidden="true" />
            Policy errors
          </div>
          {errors.slice(0, 6).map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="tool-button" type="button" disabled={isSaving} onClick={() => void save()}>
          <Save size={14} aria-hidden="true" />
          {scopeSessionId ? 'Save session' : 'Save policy'}
        </button>
        {scopeSessionId && scopeCwd && (
          <button className="tool-button" type="button" disabled={isSaving} onClick={() => void saveToProject()}>
            <Save size={14} aria-hidden="true" />
            Save to project
          </button>
        )}
        <button className="tool-button" type="button" disabled={isSaving} onClick={() => void reloadFromParent()}>
          <RotateCcw size={14} aria-hidden="true" />
          {scopeSessionId ? 'Reload project' : 'Reset'}
        </button>
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-label">
      {label}
      <input
        className="field-input font-mono"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  )
}

function SelectField<T extends string>({
  label,
  labels,
  onChange,
  options,
  value,
}: {
  label: string
  labels: Record<T, string>
  onChange: (value: T) => void
  options: readonly T[]
  value: T
}) {
  return (
    <label className="field-label">
      {label}
      <select
        className="field-input"
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => option === event.currentTarget.value)
          if (selected) onChange(selected)
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  )
}

function ListField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-label mt-2">
      {label}
      <textarea
        className="field-textarea h-20 font-mono"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  )
}

function toDraft(policy: WatchdogPolicy): PolicyDraft {
  return {
    checkIntervalMs: policy.checkIntervalMs.toString(),
    softStallMs: policy.softStallMs.toString(),
    hardStallMs: policy.hardStallMs.toString(),
    injectCooldownMs: policy.injectCooldownMs.toString(),
    maxLocalContinueRetry: policy.maxLocalContinueRetry.toString(),
    outputTailLimit: policy.outputTailLimit.toString(),
    doneMarkers: policy.doneMarkers.join('\n'),
    waitingPatterns: policy.waitingPatterns.join('\n'),
    blockedPatterns: policy.blockedPatterns.join('\n'),
    recoveryRules: policy.recoveryRules.map(toRuleDraft),
    circuitBreakerEnabled: policy.circuitBreaker.enabled,
    circuitBreakerWindowMs: policy.circuitBreaker.windowMs.toString(),
    circuitBreakerMaxRecoveries: policy.circuitBreaker.maxRecoveries.toString(),
    manualInterventionPatterns: policy.circuitBreaker.manualInterventionPatterns.join('\n'),
  }
}

function toRuleDraft(rule: RecoveryRule): RecoveryRuleDraft {
  return {
    id: rule.id,
    label: rule.label,
    state: rule.state,
    action: rule.action,
    enabled: rule.enabled,
    priority: rule.priority.toString(),
    maxRetries: rule.maxRetries.toString(),
    prompt: rule.prompt,
    resumeCommand: rule.resumeCommand,
  }
}

function readNumber(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function toPolicy(draft: PolicyDraft): WatchdogPolicy {
  return {
    version: 1,
    checkIntervalMs: readNumber(draft.checkIntervalMs, 10_000),
    softStallMs: readNumber(draft.softStallMs, 300_000),
    hardStallMs: readNumber(draft.hardStallMs, 900_000),
    injectCooldownMs: readNumber(draft.injectCooldownMs, 120_000),
    maxLocalContinueRetry: readNumber(draft.maxLocalContinueRetry, 2),
    outputTailLimit: readNumber(draft.outputTailLimit, 100_000),
    doneMarkers: readLines(draft.doneMarkers),
    waitingPatterns: readLines(draft.waitingPatterns),
    blockedPatterns: readLines(draft.blockedPatterns),
    recoveryRules: draft.recoveryRules.map(toRecoveryRule),
    circuitBreaker: {
      enabled: draft.circuitBreakerEnabled,
      windowMs: readNumber(draft.circuitBreakerWindowMs, 600_000),
      maxRecoveries: readNumber(draft.circuitBreakerMaxRecoveries, 3),
      manualInterventionPatterns: readLines(draft.manualInterventionPatterns),
    },
  }
}

function toRecoveryRule(rule: RecoveryRuleDraft): RecoveryRule {
  return {
    id: rule.id,
    label: rule.label,
    state: rule.state,
    action: rule.action,
    enabled: rule.enabled,
    priority: readNumber(rule.priority, 100),
    maxRetries: readNumber(rule.maxRetries, 1),
    prompt: rule.prompt,
    resumeCommand: rule.resumeCommand,
  }
}

function validateRegex(label: string, patterns: readonly string[]) {
  const errors: string[] = []
  patterns.forEach((pattern, index) => {
    try {
      void new RegExp(pattern, 'i')
    } catch {
      errors.push(`${label} line ${index + 1} is not a valid regex.`)
    }
  })
  return errors
}

function validateRules(rules: readonly RecoveryRule[]) {
  const errors: string[] = []
  const ids = new Set<string>()
  rules.forEach((rule, index) => {
    if (!rule.id.trim()) errors.push(`Recovery rule ${index + 1} requires an id.`)
    if (!rule.label.trim()) errors.push(`Recovery rule ${index + 1} requires a label.`)
    if (ids.has(rule.id)) errors.push(`Recovery rule ${index + 1} duplicates id ${rule.id}.`)
    ids.add(rule.id)
    if (rule.maxRetries < 1) errors.push(`Recovery rule ${index + 1} max tries must be at least 1.`)
    if (rule.action === 'auto_resume' && rule.state !== 'exited') {
      errors.push(`Recovery rule ${index + 1} can auto resume only on exited state.`)
    }
  })
  return errors
}

function validatePolicyDraft(policy: WatchdogPolicy) {
  const errors: string[] = []
  if (policy.hardStallMs < policy.softStallMs) errors.push('Hard stall must be greater than or equal to soft stall.')
  if (policy.doneMarkers.length === 0) errors.push('At least one done marker is required.')
  if (policy.waitingPatterns.length === 0) errors.push('At least one waiting regex is required.')
  if (policy.blockedPatterns.length === 0) errors.push('At least one blocked regex is required.')
  if (policy.recoveryRules.length === 0) errors.push('At least one recovery rule is required.')
  return [
    ...errors,
    ...validateRegex('Waiting regex', policy.waitingPatterns),
    ...validateRegex('Blocked regex', policy.blockedPatterns),
    ...validateRegex('Manual stop regex', policy.circuitBreaker.manualInterventionPatterns),
    ...validateRules(policy.recoveryRules),
  ]
}
