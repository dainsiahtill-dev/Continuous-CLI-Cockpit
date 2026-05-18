import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const viteBin = join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')

const viteProcess = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '8438', '--strictPort'], {
  cwd: rootDir,
  env: {
    ...process.env,
    CONTINUOUS_RENDERER_ONLY: '1',
    FORCE_COLOR: '1',
  },
  stdio: 'inherit',
})

viteProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
