import { contextBridge, ipcRenderer } from 'electron'
import type { ProjectNote, Task } from '@shared/types'
import { IPC, type ProjectNoteCreatePayload, type TaskCreatePayload, type TaskUpdatePayload } from '@shared/ipc'

// Tasks API
const tasksApi = {
  list: () => ipcRenderer.invoke(IPC.TASKS_LIST) as Promise<Task[]>,
  add: (payload: TaskCreatePayload) => ipcRenderer.invoke(IPC.TASKS_ADD, payload) as Promise<Task>,
  update: (payload: TaskUpdatePayload) => ipcRenderer.invoke(IPC.TASKS_UPDATE, payload) as Promise<Task | null>,
  remove: (id: string) => ipcRenderer.invoke(IPC.TASKS_DELETE, id) as Promise<{ id: string }>,
  addNote: (payload: ProjectNoteCreatePayload) => ipcRenderer.invoke(IPC.TASKS_NOTE_ADD, payload) as Promise<ProjectNote>,
  removeNote: (id: string) => ipcRenderer.invoke(IPC.TASKS_NOTE_DELETE, id) as Promise<{ id: string }>,
}

// Settings API
const settingsApi = {
  getApiUrl: () => ipcRenderer.invoke(IPC.SETTINGS_API_URL_GET) as Promise<string>,
  setApiUrl: (url: string) => ipcRenderer.invoke(IPC.SETTINGS_API_URL_SET, url) as Promise<{ success: boolean; error?: string }>,
  getSyncStatus: () =>
    ipcRenderer.invoke(IPC.SETTINGS_SYNC_STATUS) as Promise<{ isOnline: boolean; pendingCount: number; lastSyncAt: number }>,
  triggerSync: () => ipcRenderer.invoke(IPC.SETTINGS_TRIGGER_SYNC) as Promise<void>,
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

// Exposed API
const api = {
  tasks: tasksApi,
  onTasksChanged,
  settings: settingsApi,
  toggleOverlay,
}

export type ToodooAPI = typeof api

contextBridge.exposeInMainWorld('toodoo', api)
