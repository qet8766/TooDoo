import { contextBridge, ipcRenderer } from 'electron'
import type { Note, ProjectNote, Task } from '@shared/types'
import { IPC, type ErrorResponse, type NoteCreatePayload, type NoteUpdatePayload, type ProjectNoteCreatePayload, type ProjectNoteUpdatePayload, type TaskCreatePayload, type TaskUpdatePayload, type TaskReorderPayload } from '@shared/ipc'

// Tasks API
const tasksApi = {
  list: () => ipcRenderer.invoke(IPC.TASKS_LIST) as Promise<Task[]>,
  add: (payload: TaskCreatePayload) => ipcRenderer.invoke(IPC.TASKS_ADD, payload) as Promise<Task | ErrorResponse>,
  update: (payload: TaskUpdatePayload) => ipcRenderer.invoke(IPC.TASKS_UPDATE, payload) as Promise<Task | null | ErrorResponse>,
  remove: (id: string) => ipcRenderer.invoke(IPC.TASKS_DELETE, id) as Promise<{ id: string }>,
  reorder: (payload: TaskReorderPayload) => ipcRenderer.invoke(IPC.TASKS_REORDER, payload) as Promise<{ success: boolean }>,
  addNote: (payload: ProjectNoteCreatePayload) => ipcRenderer.invoke(IPC.TASKS_NOTE_ADD, payload) as Promise<ProjectNote | ErrorResponse>,
  updateNote: (payload: ProjectNoteUpdatePayload) => ipcRenderer.invoke(IPC.TASKS_NOTE_UPDATE, payload) as Promise<ProjectNote | null | ErrorResponse>,
  removeNote: (id: string) => ipcRenderer.invoke(IPC.TASKS_NOTE_DELETE, id) as Promise<{ id: string }>,
}

// NAS Configuration API
const configApi = {
  get: () => ipcRenderer.invoke(IPC.CONFIG_GET) as Promise<{ nasPath: string | null; machineId: string; lastSyncAt: number }>,
  setNasPath: (path: string) => ipcRenderer.invoke(IPC.CONFIG_SET_NAS_PATH, path) as Promise<{ success: boolean; error?: string }>,
  validatePath: (path: string) => ipcRenderer.invoke(IPC.CONFIG_VALIDATE_PATH, path) as Promise<{ valid: boolean; error?: string }>,
  needsSetup: () => ipcRenderer.invoke(IPC.CONFIG_NEEDS_SETUP) as Promise<boolean>,
  reload: () => ipcRenderer.invoke(IPC.CONFIG_RELOAD) as Promise<{ nasPath: string | null; machineId: string; lastSyncAt: number }>,
}

// NAS Sync API
type SyncStatus = {
  isOnline: boolean
  pendingCount: number
  lastSyncAt: number
  circuitBreakerOpen: boolean
  nextRetryAt: number | null
}

const syncApi = {
  getStatus: () => ipcRenderer.invoke(IPC.NAS_SYNC_STATUS) as Promise<SyncStatus>,
  trigger: () => ipcRenderer.invoke(IPC.NAS_TRIGGER_SYNC) as Promise<void>,
  resetCircuitBreaker: () => ipcRenderer.invoke(IPC.NAS_RESET_CIRCUIT_BREAKER) as Promise<void>,
}

// Setup API
const setupApi = {
  browseFolder: () => ipcRenderer.invoke(IPC.SETUP_BROWSE_FOLDER) as Promise<string | null>,
  complete: () => ipcRenderer.invoke(IPC.SETUP_COMPLETE) as Promise<void>,
}

// IPC Event Listeners
const onTasksChanged = (callback: () => void): (() => void) => {
  ipcRenderer.on(IPC.TASKS_CHANGED, callback)
  // Return unsubscribe function for proper cleanup
  return () => {
    ipcRenderer.removeListener(IPC.TASKS_CHANGED, callback)
  }
}

// Toggle overlay
const toggleOverlay = (isActive: boolean) => ipcRenderer.send(IPC.TOGGLE_OVERLAY, isActive)

// Open quick-add popup for a category
const openQuickAdd = (category: string) => ipcRenderer.send(IPC.QUICK_ADD_OPEN, category)

// Notes API (Notetank)
const notesApi = {
  list: () => ipcRenderer.invoke(IPC.NOTES_LIST) as Promise<Note[]>,
  add: (payload: NoteCreatePayload) => ipcRenderer.invoke(IPC.NOTES_ADD, payload) as Promise<Note | ErrorResponse>,
  update: (payload: NoteUpdatePayload) => ipcRenderer.invoke(IPC.NOTES_UPDATE, payload) as Promise<Note | null | ErrorResponse>,
  remove: (id: string) => ipcRenderer.invoke(IPC.NOTES_DELETE, id) as Promise<{ id: string }>,
}

// IPC Event Listener for Notes
const onNotesChanged = (callback: () => void): (() => void) => {
  ipcRenderer.on(IPC.NOTES_CHANGED, callback)
  return () => {
    ipcRenderer.removeListener(IPC.NOTES_CHANGED, callback)
  }
}

// Note editor controls
const noteEditorApi = {
  open: (noteId?: string) => ipcRenderer.send(IPC.NOTE_EDITOR_OPEN, noteId),
  close: () => ipcRenderer.send(IPC.NOTE_EDITOR_CLOSE),
}

// Switch between TooDoo and Notetank views
// Note: For seamless navigation, prefer using window.location.hash directly in renderer
// This IPC-based method is kept for compatibility but may cause flicker
const switchView = (view: 'toodoo' | 'notetank') => ipcRenderer.send(IPC.SWITCH_VIEW, view)

// Focus mode - minimize/expand overlay window
const setMinimized = (isMinimized: boolean) => ipcRenderer.send(IPC.WINDOW_SET_MINIMIZED, isMinimized)

// Exposed API
const api = {
  tasks: tasksApi,
  onTasksChanged,
  notes: notesApi,
  onNotesChanged,
  noteEditor: noteEditorApi,
  switchView,
  setMinimized,
  config: configApi,
  sync: syncApi,
  setup: setupApi,
  toggleOverlay,
  openQuickAdd,
}

export type ToodooAPI = typeof api

contextBridge.exposeInMainWorld('toodoo', api)
