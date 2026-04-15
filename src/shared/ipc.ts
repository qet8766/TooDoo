import type { TaskCategory } from './types'

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
  // Set to true when user manually changes category (prevents auto-demotion)
  userPromoted?: boolean
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
