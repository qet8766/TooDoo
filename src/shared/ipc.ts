import type { Note, ProjectNote, Task, TaskCategory } from './types'
import type { Result } from './result'

// IPC Channel constants - single source of truth
export const IPC = {
  // Task operations
  TASKS_LIST: 'tasks:list',
  TASKS_ADD: 'tasks:add',
  TASKS_UPDATE: 'tasks:update',
  TASKS_DELETE: 'tasks:delete',
  TASKS_REORDER: 'tasks:reorder',
  TASKS_NOTE_ADD: 'tasks:note:add',
  TASKS_NOTE_UPDATE: 'tasks:note:update',
  TASKS_NOTE_DELETE: 'tasks:note:delete',
  TASKS_CHANGED: 'tasks:changed',
  // Notes operations (Notetank)
  NOTES_LIST: 'notes:list',
  NOTES_ADD: 'notes:add',
  NOTES_UPDATE: 'notes:update',
  NOTES_DELETE: 'notes:delete',
  NOTES_CHANGED: 'notes:changed',
  // Auth
  AUTH_SIGN_IN: 'auth:sign-in',
  AUTH_SIGN_OUT: 'auth:sign-out',
  AUTH_STATUS: 'auth:status',
  AUTH_STATUS_CHANGED: 'auth:status-changed',
  // Sync
  SYNC_STATUS: 'sync:status',
  SYNC_STATUS_CHANGED: 'sync:status-changed',
  // Window control
  QUICK_ADD_OPEN: 'quick-add:open',
  NOTE_EDITOR_OPEN: 'note-editor:open',
  NOTE_EDITOR_CLOSE: 'note-editor:close',
  SWITCH_VIEW: 'switch-view',
  WINDOW_SET_MINIMIZED: 'window:set-minimized',
  WINDOW_SET_CALENDAR_OPEN: 'window:set-calendar-open',
  WINDOW_RESIZE: 'window:resize',
} as const

export type TaskCreatePayload = {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone?: boolean
  // Calendar scheduling fields
  scheduledDate?: number // Unix timestamp for scheduled date
  scheduledTime?: string // "HH:MM" format, optional
}

export type TaskUpdatePayload = {
  id: string
  title?: string
  description?: string | null
  isDone?: boolean
  category?: TaskCategory
  // Calendar scheduling fields (null to clear)
  scheduledDate?: number | null
  scheduledTime?: string | null
}

export type ProjectNoteCreatePayload = {
  id: string
  taskId: string
  content: string
}

export type ProjectNoteUpdatePayload = {
  id: string
  content: string
}

// Notes payload types (Notetank)
export type NoteCreatePayload = {
  id: string
  title: string
  content: string
}

export type NoteUpdatePayload = {
  id: string
  title?: string
  content?: string
}

// Reorder payload - moves a task to a new position within a category
export type TaskReorderPayload = {
  taskId: string
  targetIndex: number
}

// Auth payload types
export type AuthSignInPayload = {
  email: string
  password: string
}

export type AuthStatusPayload = {
  isSignedIn: boolean
  userId: string | null
}

// Sync payload types
export type SyncStatusPayload = {
  status: 'synced' | 'syncing' | 'offline' | 'error' | 'auth-expired'
}

// --- Channel Map ---
//
// Maps each invoke-style channel to its payload and response shapes.
// Consumed by the preload bridge's typed `invoke<K>()` helper so that
// callers no longer need `as Promise<T>` casts — if the channel name
// and the payload don't match this map, compilation fails.
//
// Only `invoke`-style channels are listed. One-way `send`-style channels
// (QUICK_ADD_OPEN, WINDOW_RESIZE, etc.) are intentionally excluded —
// they don't return values and don't benefit from response typing.

export type ChannelMap = {
  [IPC.TASKS_LIST]: { payload: void; response: Task[] }
  [IPC.TASKS_ADD]: { payload: TaskCreatePayload; response: Result<Task> }
  [IPC.TASKS_UPDATE]: { payload: TaskUpdatePayload; response: Result<Task | null> }
  [IPC.TASKS_DELETE]: { payload: string; response: { id: string } }
  [IPC.TASKS_REORDER]: { payload: TaskReorderPayload; response: { success: boolean } }
  [IPC.TASKS_NOTE_ADD]: { payload: ProjectNoteCreatePayload; response: Result<ProjectNote> }
  [IPC.TASKS_NOTE_UPDATE]: { payload: ProjectNoteUpdatePayload; response: Result<ProjectNote | null> }
  [IPC.TASKS_NOTE_DELETE]: { payload: string; response: { id: string } }
  [IPC.NOTES_LIST]: { payload: void; response: Note[] }
  [IPC.NOTES_ADD]: { payload: NoteCreatePayload; response: Result<Note> }
  [IPC.NOTES_UPDATE]: { payload: NoteUpdatePayload; response: Result<Note | null> }
  [IPC.NOTES_DELETE]: { payload: string; response: { id: string } }
  [IPC.AUTH_SIGN_IN]: { payload: AuthSignInPayload; response: Result<{ userId: string }> }
  [IPC.AUTH_SIGN_OUT]: { payload: void; response: Result<void> }
  [IPC.AUTH_STATUS]: { payload: void; response: AuthStatusPayload }
  [IPC.SYNC_STATUS]: { payload: void; response: SyncStatusPayload }
}

export type ChannelKey = keyof ChannelMap
