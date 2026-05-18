import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const listen = <T>(channel: string, callback: (payload: T) => void) => {
  const handler = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

type SessionConfigPayload = Record<string, unknown>
type ControlPayload = Record<string, unknown>
type PromptPayload = Record<string, unknown>
type TerminalInputPayload = { id: string; data: string }
type ResizePayload = { id: string; cols: number; rows: number }
type TerminalDataPayload = { id: string; data: string }
type TerminalScreenSnapshotPayload = { id: string; text: string }
type SessionEndedPayload = { id: string }
type SessionSnapshotPayload = Record<string, unknown>

contextBridge.exposeInMainWorld('cliAPI', {
  getDefaults: () => ipcRenderer.invoke('app:defaults'),
  getHealth: () => ipcRenderer.invoke('app:health'),
  getPolicy: () => ipcRenderer.invoke('policy:get'),
  setPolicy: (policy: Record<string, unknown>) => ipcRenderer.invoke('policy:set', policy),
  resetPolicy: () => ipcRenderer.invoke('policy:reset'),
  exportPolicy: () => ipcRenderer.invoke('policy:export'),
  importPolicy: () => ipcRenderer.invoke('policy:import'),
  getPresets: () => ipcRenderer.invoke('presets:get'),
  setPresets: (presets: Record<string, unknown>) => ipcRenderer.invoke('presets:set', presets),
  resetPresets: () => ipcRenderer.invoke('presets:reset'),
  exportPresets: () => ipcRenderer.invoke('presets:export'),
  importPresets: () => ipcRenderer.invoke('presets:import'),
  copyText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  listSessions: () => ipcRenderer.invoke('cli:list'),
  createSession: (config: SessionConfigPayload) => ipcRenderer.invoke('cli:create', config),
  stopSession: (id: string) => ipcRenderer.invoke('cli:stop', id),
  reattachSession: (id: string) => ipcRenderer.invoke('cli:reattach', id),
  setControl: (payload: ControlPayload) => ipcRenderer.invoke('cli:set-control', payload),
  injectLocalContinue: (id: string) => ipcRenderer.invoke('cli:inject-local', id),
  injectPrompt: (payload: PromptPayload) => ipcRenderer.invoke('cli:inject-prompt', payload),
  submitEnter: (id: string) => ipcRenderer.invoke('cli:submit-enter', id),
  generateFallback: (id: string) => ipcRenderer.invoke('cli:generate-fallback', id),
  fallbackAndInject: (id: string) => ipcRenderer.invoke('cli:fallback-inject', id),
  exportSession: (id: string) => ipcRenderer.invoke('cli:export-session', id),
  readTranscript: (id: string) => ipcRenderer.invoke('cli:read-transcript', id),
  getDiagnostics: (id: string) => ipcRenderer.invoke('cli:diagnostics', id),
  archiveEndedSessions: () => ipcRenderer.invoke('cli:archive-ended'),
  clearEndedSessions: () => ipcRenderer.invoke('cli:clear-ended'),
  sendInput: (payload: TerminalInputPayload) => ipcRenderer.send('cli:input', payload),
  resizeTerminal: (payload: ResizePayload) => ipcRenderer.send('cli:resize', payload),
  sendScreenSnapshot: (payload: TerminalScreenSnapshotPayload) => ipcRenderer.send('cli:screen-snapshot', payload),
  onTerminalData: (callback: (payload: TerminalDataPayload) => void) => listen('cli:terminal-data', callback),
  onSessionUpdate: (callback: (payload: SessionSnapshotPayload) => void) => listen('cli:session-update', callback),
  onSessionEnded: (callback: (payload: SessionEndedPayload) => void) => listen('cli:session-ended', callback),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
})
