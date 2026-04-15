import { contextBridge, ipcRenderer } from 'electron'
import type { Note, ProjectNote, Task } from '@shared/types'
import type { Result } from '@shared/result'
import {
  IPC,
  type NoteCreatePayload,
  type NoteUpdatePayload,
  type ProjectNoteCreatePayload,
  type ProjectNoteUpdatePayload,
  type TaskCreatePayload,
  type TaskUpdatePayload,
  type TaskReorderPayload,
} from '@shared/ipc'

// Tasks API
const tasksApi = {
  list: () => ipcRenderer.invoke(IPC.TASKS_LIST) as Promise<Task[]>,
  add: (payload: TaskCreatePayload) => ipcRenderer.invoke(IPC.TASKS_ADD, payload) as Promise<Result<Task>>,
  update: (payload: TaskUpdatePayload) => ipcRenderer.invoke(IPC.TASKS_UPDATE, payload) as Promise<Result<Task | null>>,
  remove: (id: string) => ipcRenderer.invoke(IPC.TASKS_DELETE, id) as Promise<{ id: string }>,
  reorder: (payload: TaskReorderPayload) =>
    ipcRenderer.invoke(IPC.TASKS_REORDER, payload) as Promise<{ success: boolean }>,
  addNote: (payload: ProjectNoteCreatePayload) =>
    ipcRenderer.invoke(IPC.TASKS_NOTE_ADD, payload) as Promise<Result<ProjectNote>>,
  updateNote: (payload: ProjectNoteUpdatePayload) =>
    ipcRenderer.invoke(IPC.TASKS_NOTE_UPDATE, payload) as Promise<Result<ProjectNote | null>>,
  removeNote: (id: string) => ipcRenderer.invoke(IPC.TASKS_NOTE_DELETE, id) as Promise<{ id: string }>,
}

// IPC Event Listeners
const onTasksChanged = (callback: () => void): (() => void) => {
  ipcRenderer.on(IPC.TASKS_CHANGED, callback)
  // Return unsubscribe function for proper cleanup
  return () => {
    ipcRenderer.removeListener(IPC.TASKS_CHANGED, callback)
  }
}

// Open quick-add popup for a category
const openQuickAdd = (category: string) => ipcRenderer.send(IPC.QUICK_ADD_OPEN, category)

// Notes API (Notetank)
const notesApi = {
  list: () => ipcRenderer.invoke(IPC.NOTES_LIST) as Promise<Note[]>,
  add: (payload: NoteCreatePayload) => ipcRenderer.invoke(IPC.NOTES_ADD, payload) as Promise<Result<Note>>,
  update: (payload: NoteUpdatePayload) => ipcRenderer.invoke(IPC.NOTES_UPDATE, payload) as Promise<Result<Note | null>>,
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

// Calendar open - expand/contract window width
const setCalendarOpen = (isOpen: boolean) => ipcRenderer.send(IPC.WINDOW_SET_CALENDAR_OPEN, isOpen)

// Window resize - for custom resize handles
const resizeWindow = (deltaWidth: number, deltaHeight: number) =>
  ipcRenderer.send(IPC.WINDOW_RESIZE, deltaWidth, deltaHeight)

// Exposed API
const api = {
  tasks: tasksApi,
  onTasksChanged,
  notes: notesApi,
  onNotesChanged,
  noteEditor: noteEditorApi,
  switchView,
  setMinimized,
  setCalendarOpen,
  resizeWindow,
  openQuickAdd,
}

export type ToodooAPI = typeof api

contextBridge.exposeInMainWorld('toodoo', api)
