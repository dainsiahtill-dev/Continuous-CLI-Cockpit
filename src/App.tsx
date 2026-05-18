import { useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SessionTabs } from './components/SessionTabs'
import { Sidebar } from './components/Sidebar'
import { SupervisorPanel } from './components/SupervisorPanel'
import { EmptyTerminal, TerminalPane } from './components/TerminalPane'
import { TitleBar } from './components/TitleBar'
import { useCliSessions } from './hooks/useCliSessions'

function App() {
  if (!window.cliAPI) return <BridgeUnavailable />

  return <CockpitApp />
}

function CockpitApp() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const {
    defaults,
    sessions,
    activeId,
    activeSession,
    setActiveId,
    refreshDefaults,
    refreshSessions,
    createSession,
    stopSession,
    upsertActiveSession,
  } = useCliSessions()
  const selectedSessionId = activeId || activeSession?.id || ''

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#05070a] text-zinc-100">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar
            activeId={selectedSessionId}
            collapsed={sidebarCollapsed}
            sessions={sessions}
            onActivate={setActiveId}
            onToggle={() => setSidebarCollapsed((value) => !value)}
          />
          <main className="flex min-w-0 flex-1 flex-col bg-[#05070a]">
            <SessionTabs
              activeId={selectedSessionId}
              sessions={sessions}
              onActivate={setActiveId}
              onStop={stopSession}
            />
            <div className="flex min-h-0 flex-1 gap-3 p-3">
              {activeSession ? <TerminalPane key={activeSession.id} session={activeSession} /> : <EmptyTerminal />}
              <SupervisorPanel
                activeSession={activeSession}
                defaults={defaults}
                onCreate={createSession}
                onDefaultsUpdated={refreshDefaults}
                onSessionsUpdated={refreshSessions}
                onStop={stopSession}
                onUpdated={upsertActiveSession}
              />
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}

function BridgeUnavailable() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#05070a] p-8 text-zinc-100">
      <section className="max-w-xl rounded-md border border-cyan-300/25 bg-[#091018] p-5">
        <h1 className="font-mono text-lg font-semibold text-cyan-100">Electron bridge unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          This renderer must run inside the Electron window to control local shells. Start it with{' '}
          <code>npm run dev</code> or launch the built Electron app.
        </p>
      </section>
    </div>
  )
}

export default App
