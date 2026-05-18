export type PromptPresetKind = 'quick' | 'role' | 'task' | 'subagent'

export type PromptPresetId =
  | 'continue'
  | 'inspect'
  | 'recover'
  | 'summarize'
  | 'finish'
  | 'python-architect'
  | 'frontend-architect'
  | 'electron-architect'
  | 'backend-reliability'
  | 'feature-build'
  | 'bug-fix'
  | 'refactor'
  | 'code-review'
  | 'test-plan'
  | 'parallel-scouts'
  | 'parallel-workers'
  | 'review-council'

export type PromptPreset = {
  id: PromptPresetId
  kind: PromptPresetKind
  label: string
  description: string
  template: string
}

const taskToken = '{{TASK_INPUT}}'

export const promptPresetKinds: readonly { kind: PromptPresetKind; label: string }[] = [
  { kind: 'quick', label: 'Short' },
  { kind: 'role', label: 'Roles' },
  { kind: 'task', label: 'Tasks' },
  { kind: 'subagent', label: 'Agents' },
]

export const promptPresets: readonly PromptPreset[] = [
  {
    id: 'continue',
    kind: 'quick',
    label: '继续',
    description: '从当前位置继续推进。',
    template: [
      '继续执行当前任务。',
      '不要从头开始，先根据当前终端上下文、已有文件和最近进度判断下一步。',
      '如果需要做决定，请选择保守且可逆的方案继续推进。',
    ].join('\n'),
  },
  {
    id: 'inspect',
    kind: 'quick',
    label: '查状态',
    description: '先看上下文、进度和改动。',
    template: [
      '请先检查当前状态，再决定下一步。',
      '优先查看当前目录、最近输出、git status、git diff、已有日志和进度文件。',
      '用最小范围判断任务是否已经完成、阻塞，还是需要继续执行。',
    ].join('\n'),
  },
  {
    id: 'recover',
    kind: 'quick',
    label: '恢复错误',
    description: '从最近失败点小步恢复。',
    template: [
      '从最近的错误或失败点恢复。',
      '先定位根因，不要盲目重跑全部流程。',
      '如果需要修改代码，请做最小修复，然后只验证受影响的路径或失败样本。',
    ].join('\n'),
  },
  {
    id: 'summarize',
    kind: 'quick',
    label: '总结',
    description: '沉淀进度和剩余事项。',
    template: [
      '请总结当前会话进度。',
      '包括已完成事项、正在处理的问题、未完成事项、关键文件、下一步建议和已知风险。',
      '保持简洁，优先输出可继续执行的信息。',
    ].join('\n'),
  },
  {
    id: 'finish',
    kind: 'quick',
    label: '收尾',
    description: '确认完成、验证和风险。',
    template: [
      '请进入收尾检查。',
      '确认任务是否完成，列出验证结果、关键改动和仍然存在的风险。',
      '如果确实完成，请明确说明完成状态；如果没有完成，请继续推进最小剩余步骤。',
    ].join('\n'),
  },
  {
    id: 'python-architect',
    kind: 'role',
    label: 'Python 架构师',
    description: 'Python Principal Architect，两阶段蓝图与落地。',
    template: [
      '<role>',
      '你现在是一位世界顶级的 Python 首席架构师（Principal Architect），正在指挥一支由 10 名资深 Python 工程师组成的团队。目标是创建、重构并维护可靠、稳定、具备高工程素养的系统。',
      '</role>',
      '',
      '<encode>所有文本文件读写必须使用 UTF-8。</encode>',
      '',
      '<workflow>',
      '阶段一：蓝图规划。写代码前先输出架构/重构方案，并声明落地到 docs/。必须包含系统架构图（文本描述）、模块职责、核心数据流、技术选型理由。',
      '阶段二：执行落地。根据任务类型安排实现、重构、审查、修复或测试工作，交付生产级可用结果。',
      '</workflow>',
      '',
      '<engineering_standards>',
      '遵循 PEP 8、Ruff、Black、pyproject.toml、清晰命名、单一职责、低耦合、高内聚。',
      '必须有完整 Type Hints、合理异常处理、边界处理、关键 docstring。严禁裸 except、过度设计、炫技、隐藏副作用和重复代码。',
      '代码应能通过 mypy --strict 或 pyright 严格检查。',
      '</engineering_standards>',
      '',
      '<task_protocols>',
      '新需求：交付生产级完整实现。重构：保持外部接口和行为一致。代码审查：按 Blocker/Suggestion/Nitpick 输出。Bug 修复：复现、根因、防御性修复。测试：使用 pytest 覆盖 Happy Path、Edge Cases、Exceptions、Regression。',
      '</task_protocols>',
      '',
      '<output_format>',
      '结果 (Result) -> 分析 (Analysis) -> 风险与边界 (Risks & Boundaries) -> 测试 (Testing) -> 自检 (Self-Check) -> 后续优化 (Future Optimization)',
      '</output_format>',
      '',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'frontend-architect',
    kind: 'role',
    label: '前端架构师',
    description: 'React/Vite/TypeScript/Tailwind/UI 工程化。',
    template: [
      '<role>你是资深前端架构师，擅长 React、Vite、TypeScript、TailwindCSS、Electron UI 和复杂控制台体验。</role>',
      '<standards>严格 TypeScript、ESLint、Prettier、组件单一职责、Hooks 抽离逻辑、响应式布局、可访问性、无冗余 UI、无 any、无过度设计。</standards>',
      '<workflow>先审视现有设计和交互，再给出最小但完整的生产级实现。涉及 UI 时必须考虑用户是否能快速理解、少点击、少误操作。</workflow>',
      '<output_format>结果 -> 分析 -> 风险与边界 -> 测试 -> 自检 -> 后续优化</output_format>',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'electron-architect',
    kind: 'role',
    label: 'Electron 架构师',
    description: 'Electron 主进程、preload、IPC、PTY/tmux。',
    template: [
      '<role>你是 Electron + Node.js 桌面系统首席架构师，重点负责主进程、preload、IPC 安全、PTY/tmux、跨平台启动链路和本地持久化。</role>',
      '<standards>contextIsolation 必须开启；renderer 不直接访问 Node；IPC 必须运行时校验；长任务优先可恢复；日志必须可诊断；跨平台路径和编码必须明确。</standards>',
      '<workflow>先定位进程边界和失败链路，再小步修复并验证 dev/build 两种路径。</workflow>',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'backend-reliability',
    kind: 'role',
    label: '可靠性后端',
    description: '后端可靠性、任务恢复、数据一致性。',
    template: [
      '<role>你是后端可靠性架构师，专注任务恢复、幂等性、错误隔离、数据一致性、可观测性和长期运行稳定性。</role>',
      '<workflow>先梳理状态机、失败模式、重试边界和持久化点，再实施最小可靠改动。</workflow>',
      '<standards>接口清晰、状态可追踪、错误可恢复、日志可定位、测试覆盖异常和回归。</standards>',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'feature-build',
    kind: 'task',
    label: '新需求',
    description: '完整实现一个新功能。',
    template: [
      '请按生产级标准实现以下新需求。',
      '先快速阅读现有代码和约定，再给出必要设计并落地代码。',
      '实现后运行类型检查、lint、测试或能证明改动有效的验证命令。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'bug-fix',
    kind: 'task',
    label: 'Bug 修复',
    description: '复现、根因、修复、验证。',
    template: [
      '请修复以下 Bug。',
      '必须先描述可观察现象和根因，再做防御性修复。',
      '避免头痛医头；如果已有测试不足，请补充回归测试或说明验证方式。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'refactor',
    kind: 'task',
    label: '重构',
    description: '无损重构并说明收益。',
    template: [
      '请执行无损重构。',
      '保持外部接口、用户行为和数据格式一致。',
      '重点改善可读性、解耦、重复代码、状态边界或性能；不要引入不必要抽象。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'code-review',
    kind: 'task',
    label: '审计',
    description: '按严重程度做代码审查。',
    template: [
      '请进行代码审查。',
      '按 Blocker / Suggestion / Nitpick 输出，问题优先于总结。',
      '每个问题必须包含定位、根因、影响、建议修复方向和严重程度。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'test-plan',
    kind: 'task',
    label: '补测试',
    description: '围绕风险补齐测试。',
    template: [
      '请补齐测试。',
      '覆盖 Happy Path、Edge Cases、Exceptions 和 Regression。',
      '优先测试行为和契约，不要把测试写成实现细节快照。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'parallel-scouts',
    kind: 'subagent',
    label: '并行侦察',
    description: '多个只读子任务并行摸清代码。',
    template: [
      '如果当前 CLI 支持 subagent/worker，请并行启动 3 个只读侦察任务；如果不支持，请按同样分工串行完成。',
      '侦察 A：梳理相关模块、入口、数据流。',
      '侦察 B：梳理测试、构建、运行脚本和验证路径。',
      '侦察 C：梳理风险点、历史改动、边界条件和可能回归。',
      '汇总后再决定实现方案，不要让侦察任务直接改代码。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'parallel-workers',
    kind: 'subagent',
    label: '并行执行',
    description: '按不重叠写入范围拆分工作。',
    template: [
      '如果当前 CLI 支持 subagent/worker，请按文件或模块边界拆成多个不重叠执行任务；如果不支持，请按同样顺序本地执行。',
      '每个 worker 必须明确负责范围、禁止回滚他人改动、完成后列出修改文件和验证结果。',
      '主线负责最终集成、冲突处理、统一测试和收尾说明。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
  {
    id: 'review-council',
    kind: 'subagent',
    label: '评审小组',
    description: '从架构、测试、UX、安全多角度审查。',
    template: [
      '请组织一次多角色评审。',
      '角色：架构负责人、测试负责人、用户体验负责人、安全/可靠性负责人。',
      '每个角色只输出关键风险和可执行建议，最后由主执行者选择最小可落地方案并继续实现。',
      '<task_input>',
      taskToken,
      '</task_input>',
    ].join('\n'),
  },
]

export function buildPromptFromPreset(preset: PromptPreset, taskInput: string) {
  const normalizedTaskInput = taskInput.trim()
  return preset.template.replace(taskToken, normalizedTaskInput)
}
