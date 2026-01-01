import type { ProjectNote, Task } from '@shared/types'

declare global {
  interface Window {
    toodoo: {
      tasks: {
        list: () => Promise<Task[]>
        add: (payload: { id: string; title: string; description?: string; category: string; isDone?: boolean }) => Promise<Task>
        update: (payload: { id: string; title?: string; description?: string | null; isDone?: boolean; category?: string }) =>
          Promise<Task | null>
        remove: (id: string) => Promise<{ id: string }>
        addNote: (payload: { id: string; taskId: string; content: string }) => Promise<ProjectNote>
        removeNote: (id: string) => Promise<{ id: string }>
      }
      onTasksChanged: (callback: () => void) => void
      settings: {
        getApiUrl: () => Promise<string>
        setApiUrl: (url: string) => Promise<void>
        getSyncStatus: () => Promise<{ isOnline: boolean; pendingCount: number; lastSyncAt: number }>
        triggerSync: () => Promise<void>
      }
      toggleOverlay: (isActive: boolean) => void
    }
  }
}

export {}
