import { describe, expect, it } from 'vitest'
import { buildPromptFromPreset, promptPresets, type PromptPresetId } from './promptPresets'

function getPreset(id: PromptPresetId) {
  const preset = promptPresets.find((item) => item.id === id)
  if (!preset) throw new Error(`Missing prompt preset: ${id}`)
  return preset
}

describe('prompt presets', () => {
  it('injects task input into role templates', () => {
    const preset = getPreset('python-architect')

    const prompt = buildPromptFromPreset(preset, '重构任务调度模块')

    expect(prompt).toContain('Python 首席架构师')
    expect(prompt).toContain('<task_input>')
    expect(prompt).toContain('重构任务调度模块')
    expect(prompt).not.toContain('{{TASK_INPUT}}')
  })

  it('keeps short prompts usable without task input', () => {
    const preset = getPreset('continue')

    const prompt = buildPromptFromPreset(preset, '')

    expect(prompt).toContain('继续执行当前任务')
    expect(prompt).not.toContain('{{TASK_INPUT}}')
  })
})
