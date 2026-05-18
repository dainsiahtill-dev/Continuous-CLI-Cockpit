import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

/**
 * Prevents renderer exceptions from turning the cockpit into a blank window.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Renderer error boundary caught an error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#05070a] p-8 text-zinc-100">
        <div className="max-w-xl rounded-md border border-rose-300/30 bg-rose-300/10 p-5">
          <h1 className="text-lg font-semibold text-rose-200">Renderer crashed safely</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            The terminal control process is isolated in Electron main. Reload the app window after checking the error.
          </p>
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-rose-100">
            {this.state.error.message}
          </pre>
        </div>
      </div>
    )
  }
}
