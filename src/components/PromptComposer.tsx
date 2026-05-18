import {
  CheckCircle2,
  ClipboardList,
  Code2,
  CornerDownLeft,
  Copy,
  FileInput,
  FileText,
  GitPullRequest,
  Layers3,
  Play,
  RotateCcw,
  SearchCheck,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buildPromptFromPreset,
  promptPresetKinds,
  promptPresets,
  type PromptPreset,
  type PromptPresetId,
  type PromptPresetKind,
} from '../domain/promptPresets'

type PromptComposerProps = {
  prompt: string
  onCopy: () => Promise<void>
  onInjectDirect: () => Promise<void>
  onInjectFile: () => Promise<void>
  onPromptChange: (prompt: string) => void
  onSubmitEnter: () => Promise<void>
}

const promptPresetIcons: Record<PromptPresetId, typeof Play> = {
  continue: Play,
  inspect: SearchCheck,
  recover: RotateCcw,
  summarize: FileText,
  finish: CheckCircle2,
  'python-architect': Code2,
  'frontend-architect': Layers3,
  'electron-architect': ClipboardList,
  'backend-reliability': ShieldCheck,
  'feature-build': Play,
  'bug-fix': RotateCcw,
  refactor: GitPullRequest,
  'code-review': SearchCheck,
  'test-plan': CheckCircle2,
  'parallel-scouts': Users,
  'parallel-workers': Users,
  'review-council': Users,
}

/**
 * Composes reusable prompt text for direct send, explicit file-reference send, or clipboard copy.
 */
export function PromptComposer({
  prompt,
  onCopy,
  onInjectDirect,
  onInjectFile,
  onPromptChange,
  onSubmitEnter,
}: PromptComposerProps) {
  const [activeKind, setActiveKind] = useState<PromptPresetKind>('quick')
  const [taskInput, setTaskInput] = useState('')
  const [busyAction, setBusyAction] = useState<'copy' | 'direct' | 'file' | null>(null)
  const visiblePrompts = useMemo(() => promptPresets.filter((preset) => preset.kind === activeKind), [activeKind])

  const runAction = async (action: 'copy' | 'direct' | 'file', handler: () => Promise<void>) => {
    if (!prompt.trim()) return
    setBusyAction(action)
    try {
      await handler()
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="prompt-composer" aria-label="Prompt composer">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
          <Send size={14} aria-hidden="true" />
          Prompt Composer
        </div>
        <div className="font-mono text-[11px] text-zinc-600">{prompt.trim().length} chars</div>
      </div>

      <label className="field-label">
        Task input
        <textarea
          className="field-textarea h-20"
          placeholder="Write the real task here. Role templates will place it into task_input."
          value={taskInput}
          onChange={(event) => setTaskInput(event.target.value)}
        />
      </label>

      <div className="mt-3 grid grid-cols-4 gap-1">
        {promptPresetKinds.map((item) => (
          <button
            key={item.kind}
            className={activeKind === item.kind ? 'prompt-kind-button active' : 'prompt-kind-button'}
            type="button"
            onClick={() => setActiveKind(item.kind)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {visiblePrompts.map((preset) => (
          <PromptPresetButton
            key={preset.id}
            preset={preset}
            taskInput={taskInput}
            onSelect={(nextPrompt) => onPromptChange(nextPrompt)}
          />
        ))}
      </div>

      <label className="field-label mt-4">
        Prompt to inject
        <textarea
          className="field-textarea h-28"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </label>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] gap-2">
        <button
          className="primary-button h-10"
          type="button"
          disabled={!prompt.trim() || busyAction !== null}
          onClick={() => void runAction('direct', onInjectDirect)}
        >
          <Send size={15} aria-hidden="true" />
          {busyAction === 'direct' ? 'Sending' : 'Send text'}
        </button>
        <button
          className="tool-button h-10 px-3"
          type="button"
          disabled={!prompt.trim() || busyAction !== null}
          title="Send as file reference (advanced)"
          onClick={() => void runAction('file', onInjectFile)}
        >
          <FileInput size={15} aria-hidden="true" />
        </button>
        <button
          className="tool-button h-10 px-3"
          type="button"
          disabled={!prompt.trim() || busyAction !== null}
          title="Copy prompt"
          onClick={() => void runAction('copy', onCopy)}
        >
          <Copy size={15} aria-hidden="true" />
        </button>
        <button
          className="tool-button h-10 px-3"
          type="button"
          disabled={busyAction !== null}
          title="Submit Enter"
          onClick={() => void onSubmitEnter()}
        >
          <CornerDownLeft size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

function PromptPresetButton({
  preset,
  taskInput,
  onSelect,
}: {
  preset: PromptPreset
  taskInput: string
  onSelect: (prompt: string) => void
}) {
  const Icon = promptPresetIcons[preset.id]

  return (
    <button
      className="quick-prompt-button"
      type="button"
      title={preset.description}
      onClick={() => onSelect(buildPromptFromPreset(preset, taskInput))}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{preset.label}</span>
    </button>
  )
}
