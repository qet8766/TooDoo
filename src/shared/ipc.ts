import type { TaskCategory } from './types'

// IPC Channel constants - single source of truth
export const IPC = {
  // Task operations
  TASKS_LIST: 'tasks:list',
  TASKS_ADD: 'tasks:add',
  TASKS_UPDATE: 'tasks:update',
  TASKS_DELETE: 'tasks:delete',
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
  // NAS Configuration
  CONFIG_GET: 'config:get',
  CONFIG_SET_NAS_PATH: 'config:set-nas-path',
  CONFIG_VALIDATE_PATH: 'config:validate-path',
  CONFIG_NEEDS_SETUP: 'config:needs-setup',
  CONFIG_RELOAD: 'config:reload',
  // NAS Sync
  NAS_SYNC_STATUS: 'nas:sync-status',
  NAS_TRIGGER_SYNC: 'nas:trigger-sync',
  NAS_RESET_CIRCUIT_BREAKER: 'nas:reset-circuit-breaker',
  // Setup
  SETUP_BROWSE_FOLDER: 'setup:browse-folder',
  SETUP_COMPLETE: 'setup:complete',
  // Window control
  TOGGLE_OVERLAY: 'toggle-overlay',
  QUICK_ADD_OPEN: 'quick-add:open',
  NOTE_EDITOR_OPEN: 'note-editor:open',
  NOTE_EDITOR_CLOSE: 'note-editor:close',
  SWITCH_VIEW: 'switch-view',
} as const

export type TaskCreatePayload = {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone?: boolean
}

export type TaskUpdatePayload = {
  id: string
  title?: string
  description?: string | null
  isDone?: boolean
  category?: TaskCategory
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

// Error response type for validation failures
export type ErrorResponse = { error: string }
