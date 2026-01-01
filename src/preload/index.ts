import { contextBridge, ipcRenderer } from 'electron'
import type { ProjectNote, Task } from '@shared/types'

// Tasks API
const tasksApi = {
  list: () => ipcRenderer.invoke('tasks:list') as Promise<Task[]>,
  add: (payload: { id: string; title: string; description?: string; category: string; isDone?: boolean }) =>
    ipcRenderer.invoke('tasks:add', payload) as Promise<Task>,
  update: (payload: { id: string; title?: string; description?: string | null; isDone?: boolean; category?: string }) =>
    ipcRenderer.invoke('tasks:update', payload) as Promise<Task | null>,
  remove: (id: string) => ipcRenderer.invoke('tasks:delete', id) as Promise<{ id: string }>,
  addNote: (payload: { id: string; taskId: string; content: string }) =>
    ipcRenderer.invoke('tasks:note:add', payload) as Promise<ProjectNote>,
  removeNote: (id: string) => ipcRenderer.invoke('tasks:note:delete', id) as Promise<{ id: string }>,
}

// Settings API
const settingsApi = {
  getApiUrl: () => ipcRenderer.invoke('settings:api-url:get') as Promise<string>,
  setApiUrl: (url: string) => ipcRenderer.invoke('settings:api-url:set', url) as Promise<void>,
  getSyncStatus: () =>
    ipcRenderer.invoke('settings:sync-status') as Promise<{ isOnline: boolean; pendingCount: number; lastSyncAt: number }>,
  triggerSync: () => ipcRenderer.invoke('settings:trigger-sync') as Promise<void>,
}

// IPC Event Listeners
const onTasksChanged = (callback: () => void) => {
  ipcRenderer.removeAllListeners('tasks:changed')
  ipcRenderer.on('tasks:changed', callback)
}

// Toggle overlay
const toggleOverlay = (isActive: boolean) => ipcRenderer.send('toggle-overlay', isActive)

// Exposed API
const api = {
  tasks: tasksApi,
  onTasksChanged,
  settings: settingsApi,
  toggleOverlay,
}

contextBridge.exposeInMainWorld('toodoo', api)
