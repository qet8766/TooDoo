import type { TaskCategory } from './types'

// IPC Channel constants - single source of truth
export const IPC = {
  // Task operations
  TASKS_LIST: 'tasks:list',
  TASKS_ADD: 'tasks:add',
  TASKS_UPDATE: 'tasks:update',
  TASKS_DELETE: 'tasks:delete',
  TASKS_NOTE_ADD: 'tasks:note:add',
  TASKS_NOTE_DELETE: 'tasks:note:delete',
  TASKS_CHANGED: 'tasks:changed',
  // Settings
  SETTINGS_API_URL_GET: 'settings:api-url:get',
  SETTINGS_API_URL_SET: 'settings:api-url:set',
  SETTINGS_SYNC_STATUS: 'settings:sync-status',
  SETTINGS_TRIGGER_SYNC: 'settings:trigger-sync',
  // Window control
  TOGGLE_OVERLAY: 'toggle-overlay',
  QUICK_ADD_OPEN: 'quick-add:open',
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
