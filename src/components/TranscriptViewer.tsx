import { ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CliSessionSnapshot, TranscriptReadResult } from '../types/electron'

const PAGE_SIZE = 160

type TranscriptViewerProps = {
  initialQuery?: string
  session: CliSessionSnapshot
}

/**
 * Reads transcript text on demand and renders only a bounded line window.
 */
export function TranscriptViewer({ initialQuery = '', session }: TranscriptViewerProps) {
  const [result, setResult] = useState<TranscriptReadResult | null>(null)
  const [query, setQuery] = useState(() => initialQuery)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const lines = useMemo(() => (result?.text ? result.text.split(/\r?\n/) : []), [result])
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return lines.reduce<number[]>((items, line, index) => {
      if (line.toLowerCase().includes(normalized)) items.push(index)
      return items
    }, [])
  }, [lines, query])

  const visibleLines = lines.slice(offset, offset + PAGE_SIZE)
  const pageEnd = Math.min(lines.length, offset + PAGE_SIZE)

  const load = async () => {
    setIsLoading(true)
    try {
      const nextResult = await window.cliAPI.readTranscript(session.id)
      if (nextResult) {
        setResult(nextResult)
        setOffset(0)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const jumpToMatch = (direction: 'prev' | 'next') => {
    if (matches.length === 0) return
    const current =
      direction === 'next'
        ? matches.find((line) => line > offset)
        : [...matches].reverse().find((line) => line < offset)
    const target = current ?? (direction === 'next' ? matches[0] : matches[matches.length - 1])
    setOffset(Math.max(0, (target ?? 0) - 8))
  }

  return (
    <div className="mt-4 rounded-md border border-cyan-300/12 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
          <FileText size={14} aria-hidden="true" />
          Transcript
        </div>
        <button className="tool-button px-3" type="button" disabled={isLoading} onClick={load}>
          {isLoading ? 'Loading' : 'Load'}
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 text-zinc-500" size={13} aria-hidden="true" />
          <input
            className="field-input pl-7"
            placeholder="Search transcript"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOffset(0)
            }}
          />
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Previous transcript match"
          onClick={() => jumpToMatch('prev')}
        >
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Next transcript match"
          onClick={() => jumpToMatch('next')}
        >
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>

      {result && (
        <>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span>
              Lines {lines.length === 0 ? 0 : offset + 1}-{pageEnd} / {lines.length}
            </span>
            <span>{matches.length} matches</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="tool-button flex-1"
              type="button"
              onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            >
              Page up
            </button>
            <button
              className="tool-button flex-1"
              type="button"
              onClick={() => setOffset((value) => Math.min(Math.max(0, lines.length - PAGE_SIZE), value + PAGE_SIZE))}
            >
              Page down
            </button>
          </div>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-white/10 bg-black/35 p-2 font-mono text-[11px] leading-5 text-zinc-300">
            {visibleLines.map((line, index) => {
              const lineNumber = offset + index + 1
              const matched = matches.includes(offset + index)
              return `${matched ? '>' : ' '} ${lineNumber.toString().padStart(5, ' ')}  ${line}\n`
            })}
          </pre>
          <div className="mt-2 break-all text-[11px] text-zinc-600">
            {result.truncated ? 'Showing tail of large transcript: ' : 'Path: '}
            {result.path}
          </div>
        </>
      )}
    </div>
  )
}
