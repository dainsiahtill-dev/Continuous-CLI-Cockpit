import clsx from 'clsx'
import { modeCopy, runModes } from '../domain/cli'
import type { RunMode } from '../types/electron'

type RunModeSelectorProps = {
  value: RunMode
  onChange: (value: RunMode) => void
}

export function RunModeSelector({ value, onChange }: RunModeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {runModes.map((mode) => (
        <button
          key={mode}
          className={clsx('mode-button', value === mode && 'active')}
          type="button"
          aria-label={`${modeCopy[mode].label} ${modeCopy[mode].short}`}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
        >
          <span>{modeCopy[mode].label}</span>
          <small>{modeCopy[mode].short}</small>
        </button>
      ))}
    </div>
  )
}
