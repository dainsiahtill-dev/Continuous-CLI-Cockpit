import { Maximize2, Minus, ShieldCheck, X, Zap } from 'lucide-react'

export function TitleBar() {
  return (
    <div className="drag-region flex h-12 shrink-0 items-center border-b border-cyan-400/20 bg-[#080d12]">
      <div className="flex h-full w-64 items-center gap-3 border-r border-cyan-400/20 px-4">
        <div className="grid h-8 w-8 place-items-center rounded-md border border-cyan-300/60 bg-cyan-300/10 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.22)]">
          <Zap size={17} aria-hidden="true" />
        </div>
        <div className="font-mono text-sm font-semibold text-cyan-100">CLI.COCKPIT</div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-4 text-xs text-zinc-400">
        <ShieldCheck size={15} className="text-emerald-300" aria-hidden="true" />
        <span className="truncate">
          Run any CLI in any directory. Observe, assist, or autopilot only when you choose.
        </span>
      </div>
      <div className="no-drag flex h-full items-center">
        <button
          className="window-button"
          type="button"
          aria-label="Minimize window"
          onClick={() => window.cliAPI.minimize()}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          className="window-button"
          type="button"
          aria-label="Maximize window"
          onClick={() => window.cliAPI.maximize()}
        >
          <Maximize2 size={15} aria-hidden="true" />
        </button>
        <button
          className="window-button danger"
          type="button"
          aria-label="Close window"
          onClick={() => window.cliAPI.close()}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
