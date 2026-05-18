import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useCallback, useEffect, useRef } from 'react'
import type { CliSessionSnapshot } from '../types/electron'

function readCurrentScreen(terminal: Terminal) {
  const buffer = terminal.buffer.active
  const start = Math.max(0, buffer.baseY)
  const end = Math.min(buffer.length, start + terminal.rows)
  const lines: string[] = []

  for (let index = start; index < end; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '')
  }

  return lines.join('\n')
}

/**
 * Owns xterm lifecycle and keeps high-frequency terminal output outside React render state.
 */
export function useTerminalBridge(session: CliSessionSnapshot) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const initialOutputRef = useRef(session.outputTail)
  const terminalRef = useRef<Terminal | null>(null)

  const copySelection = useCallback(() => terminalRef.current?.getSelection().trim() ?? '', [])

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'underline',
      fontFamily: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.35,
      theme: {
        background: '#000000',
        foreground: '#37e8ee',
        cursor: '#f0abfc',
        selectionBackground: '#155e75',
        black: '#050505',
        red: '#fb7185',
        green: '#86efac',
        yellow: '#facc15',
        blue: '#67e8f9',
        magenta: '#f0abfc',
        cyan: '#22d3ee',
        white: '#f8fafc',
      },
    })
    terminal.attachCustomKeyEventHandler((event) => {
      const isCopyShortcut = event.type === 'keydown' && event.shiftKey && (event.ctrlKey || event.metaKey)
      if (!isCopyShortcut || event.key.toLowerCase() !== 'c') return true

      const selection = terminal.getSelection().trim()
      if (selection) void window.cliAPI.copyText(selection)
      return false
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    terminalRef.current = terminal
    terminal.write(initialOutputRef.current)
    fitAddon.fit()

    let snapshotTimer: number | null = null
    const sendScreenSnapshot = () => {
      window.cliAPI.sendScreenSnapshot({ id: session.id, text: readCurrentScreen(terminal) })
    }
    const scheduleScreenSnapshot = () => {
      if (snapshotTimer !== null) return
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = null
        sendScreenSnapshot()
      }, 120)
    }
    scheduleScreenSnapshot()

    const inputDisposable = terminal.onData((data) => {
      window.cliAPI.sendInput({ id: session.id, data })
    })

    const removeTerminalListener = window.cliAPI.onTerminalData((payload) => {
      if (payload.id === session.id) terminal.write(payload.data, scheduleScreenSnapshot)
    })

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
        window.cliAPI.resizeTerminal({ id: session.id, cols: terminal.cols, rows: terminal.rows })
        scheduleScreenSnapshot()
      })
    })
    resizeObserver.observe(containerRef.current)
    const snapshotInterval = window.setInterval(sendScreenSnapshot, 2_000)

    return () => {
      if (terminalRef.current === terminal) terminalRef.current = null
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer)
      window.clearInterval(snapshotInterval)
      inputDisposable.dispose()
      removeTerminalListener()
      resizeObserver.disconnect()
      terminal.dispose()
    }
  }, [session.id])

  return { containerRef, copySelection }
}
