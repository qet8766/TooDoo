import fs from 'node:fs'
import path from 'node:path'
import { app } from '../electron'
import type { ProjectNote, Task, TaskCategory } from '@shared/types'

// --- Types ---

type SyncQueueItem = {
  id: string
  table: string
  recordId: string
  operation: 'create' | 'update' | 'delete'
  payload: object | null
  createdAt: number
  retryCount: number
}

type LocalStore = {
  cache: {
    tasks: Task[]
    lastSyncAt: number
  }
  syncQueue: SyncQueueItem[]
  settings: {
    apiUrl: string
  }
}

// --- Local Storage (JSON file) ---

let store: LocalStore | null = null
let storePath: string | null = null

const getDefaultStore = (): LocalStore => ({
  cache: {
    tasks: [],
    lastSyncAt: 0,
  },
  syncQueue: [],
  settings: {
    apiUrl: 'http://100.76.250.5:3456',
  },
})

const loadStore = (): LocalStore => {
  if (store) return store

  const userData = app.getPath('userData')
  fs.mkdirSync(userData, { recursive: true })
  storePath = path.join(userData, 'toodoo-store.json')

  try {
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf-8')
      store = { ...getDefaultStore(), ...JSON.parse(data) }
    } else {
      store = getDefaultStore()
    }
  } catch (error) {
    console.warn('[TooDoo] Failed to load store, using defaults:', error)
    store = getDefaultStore()
  }

  return store!
}

const saveStore = () => {
  if (!store || !storePath) return
  try {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2))
  } catch (error) {
    console.warn('[TooDoo] Failed to save store:', error)
  }
}

const ensureStore = () => {
  if (!store) loadStore()
  return store!
}

// --- API Client ---

const getApiUrl = () => ensureStore().settings.apiUrl

const apiFetch = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> => {
  try {
    const url = `${getApiUrl()}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      return { data: null, error: errorData.error || `HTTP ${response.status}` }
    }

    const data = (await response.json()) as T
    return { data, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    return { data: null, error: message }
  }
}

// --- Sync Queue Management ---

let isOnline = false
let syncInProgress = false
let syncInterval: ReturnType<typeof setInterval> | null = null

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const enqueueSync = (
  table: string,
  recordId: string,
  operation: 'create' | 'update' | 'delete',
  payload: object | null,
) => {
  const s = ensureStore()

  // Remove existing operations for this record (coalesce)
  s.syncQueue = s.syncQueue.filter(
    (item) => !(item.table === table && item.recordId === recordId),
  )

  s.syncQueue.push({
    id: generateId(),
    table,
    recordId,
    operation,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  })

  saveStore()
  console.info(`[TooDoo] Queued ${operation} for ${table}:${recordId}`)
}

const dequeueSync = (id: string) => {
  const s = ensureStore()
  s.syncQueue = s.syncQueue.filter((item) => item.id !== id)
  saveStore()
}

const incrementRetryCount = (id: string) => {
  const s = ensureStore()
  const item = s.syncQueue.find((i) => i.id === id)
  if (item) {
    item.retryCount++
    saveStore()
  }
}

export const getSyncQueueCount = (): number => {
  return ensureStore().syncQueue.length
}

export const getSyncStatus = (): { isOnline: boolean; pendingCount: number; lastSyncAt: number } => {
  const s = ensureStore()
  return {
    isOnline,
    pendingCount: s.syncQueue.length,
    lastSyncAt: s.cache.lastSyncAt,
  }
}

const checkOnlineStatus = async (): Promise<boolean> => {
  const { error } = await apiFetch('/api/health')
  isOnline = !error
  return isOnline
}

const processQueueItem = async (item: SyncQueueItem): Promise<boolean> => {
  let endpoint = ''
  let method = ''
  let body: string | undefined

  switch (item.table) {
    case 'tasks':
      if (item.operation === 'delete') {
        endpoint = `/api/tasks/${item.recordId}`
        method = 'DELETE'
      } else {
        endpoint = item.operation === 'create' ? '/api/tasks' : `/api/tasks/${item.recordId}`
        method = item.operation === 'create' ? 'POST' : 'PUT'
        body = JSON.stringify(item.payload)
      }
      break

    case 'project_notes':
      if (item.operation === 'delete') {
        endpoint = `/api/tasks/notes/${item.recordId}`
        method = 'DELETE'
      } else if (item.payload) {
        const notePayload = item.payload as { taskId: string }
        endpoint = `/api/tasks/${notePayload.taskId}/notes`
        method = 'POST'
        body = JSON.stringify(item.payload)
      }
      break

    default:
      console.warn(`[TooDoo] Unknown table in sync queue: ${item.table}`)
      dequeueSync(item.id)
      return true
  }

  const { error } = await apiFetch(endpoint, { method, body })

  if (error) {
    console.warn(`[TooDoo] Failed to sync ${item.table}:${item.recordId}:`, error)
    incrementRetryCount(item.id)
    return false
  }

  dequeueSync(item.id)
  console.info(`[TooDoo] Synced ${item.operation} for ${item.table}:${item.recordId}`)
  return true
}

const syncFromServer = async () => {
  const s = ensureStore()

  const tasksRes = await apiFetch<Task[]>('/api/tasks')

  if (tasksRes.data) {
    s.cache.tasks = tasksRes.data
  }

  s.cache.lastSyncAt = Date.now()
  saveStore()

  console.info(`[TooDoo] Synced from server - Tasks: ${tasksRes.data?.length ?? 0}`)
}

const processSyncQueue = async () => {
  if (syncInProgress) return
  syncInProgress = true

  try {
    const online = await checkOnlineStatus()
    if (!online) {
      console.info('[TooDoo] Offline - skipping sync')
      return
    }

    // Pull latest from server
    await syncFromServer()

    // Process pending queue items
    const s = ensureStore()
    const pendingItems = [...s.syncQueue]

    if (pendingItems.length === 0) return

    console.info(`[TooDoo] Processing ${pendingItems.length} queued items`)

    for (const item of pendingItems) {
      const success = await processQueueItem(item)
      if (!success) {
        const stillOnline = await checkOnlineStatus()
        if (!stillOnline) break
      }
    }
  } finally {
    syncInProgress = false
  }
}

export const startSyncScheduler = () => {
  if (syncInterval) return

  syncInterval = setInterval(() => {
    void processSyncQueue()
  }, 30000)

  // Initial sync
  void processSyncQueue()
  console.info(`[TooDoo] Sync scheduler started - ${getSyncQueueCount()} items pending`)
}

export const stopSyncScheduler = () => {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.info('[TooDoo] Sync scheduler stopped')
  }
}

export const triggerSync = () => {
  void processSyncQueue()
}

// --- Database Initialization ---

export const initDatabase = () => {
  loadStore()
  startSyncScheduler()
  console.info('[TooDoo] Database initialized (REST API mode)')
}

// --- API URL Settings ---

export const getApiUrlSetting = (): string => {
  return ensureStore().settings.apiUrl
}

export const setApiUrlSetting = (url: string) => {
  const s = ensureStore()
  s.settings.apiUrl = url
  saveStore()
  void processSyncQueue()
}

// --- Tasks ---

export const getTasks = async (): Promise<Task[]> => {
  const s = ensureStore()

  // Try to sync from server
  if (await checkOnlineStatus()) {
    const { data } = await apiFetch<Task[]>('/api/tasks')
    if (data) {
      s.cache.tasks = data
      saveStore()
      return data
    }
  }

  // Return cached data if offline or error
  return s.cache.tasks
}

export const addTask = (payload: {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone?: boolean
}): Task => {
  const s = ensureStore()
  const now = Date.now()

  const task: Task = {
    id: payload.id,
    title: payload.title.trim(),
    description: payload.description?.trim(),
    category: payload.category,
    isDone: payload.isDone || false,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  // Update local cache
  s.cache.tasks = [task, ...s.cache.tasks.filter((t) => t.id !== task.id)]
  saveStore()

  // Queue for sync
  enqueueSync('tasks', task.id, 'create', task)

  // Try immediate push
  void apiFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  }).then(({ error }) => {
    if (!error) {
      dequeueSync(s.syncQueue.find((i) => i.recordId === task.id)?.id || '')
    }
  })

  return task
}

export const updateTask = (payload: {
  id: string
  title?: string
  description?: string | null
  isDone?: boolean
  category?: TaskCategory
}): Task | null => {
  const s = ensureStore()
  const existing = s.cache.tasks.find((t) => t.id === payload.id)
  if (!existing) return null

  const updated: Task = {
    ...existing,
    title: payload.title !== undefined ? payload.title.trim() : existing.title,
    description: payload.description === null ? undefined : (payload.description?.trim() ?? existing.description),
    category: payload.category ?? existing.category,
    isDone: payload.isDone ?? existing.isDone,
    updatedAt: Date.now(),
  }

  // Update local cache
  s.cache.tasks = s.cache.tasks.map((t) => (t.id === updated.id ? updated : t))
  saveStore()

  // Queue for sync
  enqueueSync('tasks', updated.id, 'update', updated)

  // Try immediate push
  void apiFetch(`/api/tasks/${updated.id}`, {
    method: 'PUT',
    body: JSON.stringify(updated),
  }).then(({ error }) => {
    if (!error) {
      dequeueSync(s.syncQueue.find((i) => i.recordId === updated.id)?.id || '')
    }
  })

  return updated
}

export const deleteTask = (id: string) => {
  const s = ensureStore()

  // Update local cache
  s.cache.tasks = s.cache.tasks.filter((t) => t.id !== id)
  saveStore()

  // Queue for sync
  enqueueSync('tasks', id, 'delete', null)

  // Try immediate push
  void apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(({ error }) => {
    if (!error) {
      dequeueSync(s.syncQueue.find((i) => i.recordId === id)?.id || '')
    }
  })
}

// --- Project Notes ---

export const addProjectNote = (payload: { id: string; taskId: string; content: string }): ProjectNote => {
  const s = ensureStore()
  const now = Date.now()

  const note: ProjectNote = {
    id: payload.id,
    taskId: payload.taskId,
    content: payload.content.trim(),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  // Update local cache - add to task's projectNotes
  s.cache.tasks = s.cache.tasks.map((t) => {
    if (t.id === payload.taskId) {
      return {
        ...t,
        projectNotes: [...(t.projectNotes || []), note],
      }
    }
    return t
  })
  saveStore()

  // Queue for sync
  enqueueSync('project_notes', note.id, 'create', note)

  // Try immediate push
  void apiFetch(`/api/tasks/${payload.taskId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ id: note.id, content: note.content }),
  }).then(({ error }) => {
    if (!error) {
      dequeueSync(s.syncQueue.find((i) => i.recordId === note.id)?.id || '')
    }
  })

  return note
}

export const deleteProjectNote = (id: string) => {
  const s = ensureStore()

  // Update local cache - remove from task's projectNotes
  s.cache.tasks = s.cache.tasks.map((t) => {
    if (t.projectNotes) {
      return {
        ...t,
        projectNotes: t.projectNotes.filter((n) => n.id !== id),
      }
    }
    return t
  })
  saveStore()

  // Queue for sync
  enqueueSync('project_notes', id, 'delete', null)

  // Try immediate push
  void apiFetch(`/api/tasks/notes/${id}`, { method: 'DELETE' }).then(({ error }) => {
    if (!error) {
      dequeueSync(s.syncQueue.find((i) => i.recordId === id)?.id || '')
    }
  })
}
