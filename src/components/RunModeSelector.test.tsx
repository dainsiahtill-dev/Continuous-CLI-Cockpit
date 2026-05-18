import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunModeSelector } from './RunModeSelector'

describe('RunModeSelector', () => {
  it('shows all modes and marks the current mode', () => {
    render(<RunModeSelector value="manual" onChange={() => undefined} />)

    expect(screen.getByRole('button', { name: /manual human/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /assisted suggest/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /autopilot auto/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the selected mode to the controller', () => {
    const onChange = vi.fn()
    render(<RunModeSelector value="manual" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /autopilot auto/i }))

    expect(onChange).toHaveBeenCalledWith('autopilot')
  })
})
