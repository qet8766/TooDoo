import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AuthStatusPayload,
  type ChannelKey,
  type ChannelMap,
  type NoteCreatePayload,
  type NoteUpdatePayload,
  type ProjectNoteCreatePayload,
  type ProjectNoteUpdatePayload,
  type SyncStatusPayload,
  type TaskCreatePayload,
  type TaskReorderPayload,
  type TaskUpdatePayload,
  type AuthSignInPayload,
} from '@shared/ipc'

// --- Typed invoke bridge ---
//
// Single entry point for all invoke-style channels. Return type is derived
// from the ChannelMap, so the old `as Promise<T>` casts are gone and a typo
// in a channel name or payload shape fails at compile time.
const invoke = <K extends ChannelKey>(
  channel: K,
  ...args: ChannelMap[K]['payload'] extends void ? [] : [ChannelMap[K]['payload']]
): Promise<ChannelMap[K]['response']> => ipcRenderer.invoke(channel, ...args) as Promise<ChannelMap[K]['response']>

// --- Event subscription helper ---
// All `ipcRenderer.on`-based subscriptions return an unsubscribe function.
const subscribe = <T>(channel: string, callback: (payload: T) => void): (() => void) => {
  const handler = (_event: unknown, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// --- Task API ---

const tasksApi = {
  list: () => invoke(IPC.TASKS_LIST),
  add: (payload: TaskCreatePayload) => invoke(IPC.TASKS_ADD, payload),
  update: (payload: TaskUpdatePayload) => invoke(IPC.TASKS_UPDATE, payload),
  remove: (id: string) => invoke(IPC.TASKS_DELETE, id),
  reorder: (payload: TaskReorderPayload) => invoke(IPC.TASKS_REORDER, payload),
  addNote: (payload: ProjectNoteCreatePayload) => invoke(IPC.TASKS_NOTE_ADD, payload),
  updateNote: (payload: ProjectNoteUpdatePayload) => invoke(IPC.TASKS_NOTE_UPDATE, payload),
  removeNote: (id: string) => invoke(IPC.TASKS_NOTE_DELETE, id),
}

const onTasksChanged = (callback: () => void): (() => void) => {
  const handler = () => callback()
  ipcRenderer.on(IPC.TASKS_CHANGED, handler)
  return () => ipcRenderer.removeListener(IPC.TASKS_CHANGED, handler)
}

// --- Notes API (Notetank) ---

const notesApi = {
  list: () => invoke(IPC.NOTES_LIST),
  add: (payload: NoteCreatePayload) => invoke(IPC.NOTES_ADD, payload),
  update: (payload: NoteUpdatePayload) => invoke(IPC.NOTES_UPDATE, payload),
  remove: (id: string) => invoke(IPC.NOTES_DELETE, id),
}

const onNotesChanged = (callback: () => void): (() => void) => {
  const handler = () => callback()
  ipcRenderer.on(IPC.NOTES_CHANGED, handler)
  return () => ipcRenderer.removeListener(IPC.NOTES_CHANGED, handler)
}

// --- Auth API ---

const authApi = {
  signIn: (payload: AuthSignInPayload) => invoke(IPC.AUTH_SIGN_IN, payload),
  signOut: () => invoke(IPC.AUTH_SIGN_OUT),
  getStatus: () => invoke(IPC.AUTH_STATUS),
}

const onAuthStatusChanged = (callback: (status: AuthStatusPayload) => void): (() => void) =>
  subscribe(IPC.AUTH_STATUS_CHANGED, callback)

// --- Sync API ---

const syncApi = {
  getStatus: () => invoke(IPC.SYNC_STATUS),
}

const onSyncStatusChanged = (callback: (status: SyncStatusPayload) => void): (() => void) =>
  subscribe(IPC.SYNC_STATUS_CHANGED, callback)

// --- One-way window / popup controls ---

const openQuickAdd = (category: string) => ipcRenderer.send(IPC.QUICK_ADD_OPEN, category)

const noteEditorApi = {
  open: (noteId?: string) => ipcRenderer.send(IPC.NOTE_EDITOR_OPEN, noteId),
  close: () => ipcRenderer.send(IPC.NOTE_EDITOR_CLOSE),
}

const setMinimized = (isMinimized: boolean) => ipcRenderer.send(IPC.WINDOW_SET_MINIMIZED, isMinimized)

const setCalendarOpen = (isOpen: boolean) => ipcRenderer.send(IPC.WINDOW_SET_CALENDAR_OPEN, isOpen)

const resizeWindow = (deltaWidth: number, deltaHeight: number) =>
  ipcRenderer.send(IPC.WINDOW_RESIZE, deltaWidth, deltaHeight)

// --- Exposed API ---

const api = {
  tasks: tasksApi,
  onTasksChanged,
  notes: notesApi,
  onNotesChanged,
  noteEditor: noteEditorApi,
  auth: authApi,
  onAuthStatusChanged,
  sync: syncApi,
  onSyncStatusChanged,
  setMinimized,
  setCalendarOpen,
  resizeWindow,
  openQuickAdd,
}

export type ToodooAPI = typeof api

contextBridge.exposeInMainWorld('toodoo', api)
