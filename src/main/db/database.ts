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

const generateId = () => crypto.randomUUID()

const enqueueSync = (
  table: string,
  recordId: string,
  operation: 'create' | 'update' | 'delete',
  payload: object | null,
): string => {
  const s = ensureStore()
  const id = generateId()

  // Find existing operation for this record
  const existingIndex = s.syncQueue.findIndex(
    (item) => item.table === table && item.recordId === recordId,
  )

  if (existingIndex !== -1) {
    const existing = s.syncQueue[existingIndex]

    // Handle operation coalescing carefully to prevent data loss
    if (existing.operation === 'create' && operation === 'delete') {
      // If we're deleting something that was never synced (created offline),
      // just remove the create operation - no need to sync anything
      s.syncQueue.splice(existingIndex, 1)
      saveStore()
      console.info(`[TooDoo] Removed unsent create for ${table}:${recordId} (deleted before sync)`)
      return id
    }

    if (existing.operation === 'create' && operation === 'update') {
      // Merge update into create - keep it as a create with updated payload
      s.syncQueue[existingIndex] = {
        ...existing,
        payload: { ...existing.payload, ...payload },
      }
      saveStore()
      console.info(`[TooDoo] Merged update into pending create for ${table}:${recordId}`)
      return existing.id
    }

    // For other cases, remove the old operation
    s.syncQueue.splice(existingIndex, 1)
  }

  s.syncQueue.push({
    id,
    table,
    recordId,
    operation,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  })

  saveStore()
  console.info(`[TooDoo] Queued ${operation} for ${table}:${recordId}`)
  return id
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

const tryImmediateSync = (queueId: string, request: { endpoint: string; method: string; body?: object }) => {
  void apiFetch(request.endpoint, {
    method: request.method,
    body: request.body ? JSON.stringify(request.body) : undefined,
  }).then(({ error }) => {
    if (!error) {
      dequeueSync(queueId)
    }
  })
}

// Helper: Update tasks cache and persist
const updateTasksCache = (updater: (tasks: Task[]) => Task[]) => {
  const s = ensureStore()
  s.cache.tasks = updater(s.cache.tasks)
  saveStore()
}

// Helper: Queue operation and attempt immediate sync
const queueAndSync = (
  table: string,
  recordId: string,
  operation: 'create' | 'update' | 'delete',
  payload: object | null,
  request: { endpoint: string; method: string; body?: object },
) => {
  const queueId = enqueueSync(table, recordId, operation, payload)
  tryImmediateSync(queueId, request)
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

const syncFromServer = async (): Promise<boolean> => {
  const s = ensureStore()

  const tasksRes = await apiFetch<Task[]>('/api/tasks')

  if (tasksRes.data) {
    s.cache.tasks = tasksRes.data
    s.cache.lastSyncAt = Date.now()
    saveStore()
    console.info(`[TooDoo] Synced from server - Tasks: ${tasksRes.data.length}`)
    return true
  }

  console.warn('[TooDoo] Failed to sync from server:', tasksRes.error)
  return false
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

const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const setApiUrlSetting = (url: string): { success: boolean; error?: string } => {
  const trimmed = url.trim()

  if (!trimmed) {
    return { success: false, error: 'URL cannot be empty' }
  }

  if (!isValidUrl(trimmed)) {
    return { success: false, error: 'Invalid URL format. Must be a valid HTTP/HTTPS URL.' }
  }

  const s = ensureStore()
  s.settings.apiUrl = trimmed
  saveStore()
  void processSyncQueue()
  return { success: true }
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

  updateTasksCache(tasks => [task, ...tasks.filter(t => t.id !== task.id)])
  queueAndSync('tasks', task.id, 'create', task, { endpoint: '/api/tasks', method: 'POST', body: task })
  return task
}

export const updateTask = (payload: {
  id: string
  title?: string
  description?: string | null
  isDone?: boolean
  category?: TaskCategory
}): Task | null => {
  const existing = ensureStore().cache.tasks.find(t => t.id === payload.id)
  if (!existing) return null

  const updated: Task = {
    ...existing,
    title: payload.title !== undefined ? payload.title.trim() : existing.title,
    description: payload.description === null ? undefined : (payload.description?.trim() ?? existing.description),
    category: payload.category ?? existing.category,
    isDone: payload.isDone ?? existing.isDone,
    updatedAt: Date.now(),
  }

  updateTasksCache(tasks => tasks.map(t => t.id === updated.id ? updated : t))
  queueAndSync('tasks', updated.id, 'update', updated, { endpoint: `/api/tasks/${updated.id}`, method: 'PUT', body: updated })
  return updated
}

export const deleteTask = (id: string) => {
  updateTasksCache(tasks => tasks.filter(t => t.id !== id))
  queueAndSync('tasks', id, 'delete', null, { endpoint: `/api/tasks/${id}`, method: 'DELETE' })
}

// --- Project Notes ---

export const addProjectNote = (payload: { id: string; taskId: string; content: string }): ProjectNote => {
  const now = Date.now()
  const note: ProjectNote = {
    id: payload.id,
    taskId: payload.taskId,
    content: payload.content.trim(),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  updateTasksCache(tasks => tasks.map(t =>
    t.id === payload.taskId ? { ...t, projectNotes: [...(t.projectNotes || []), note] } : t
  ))
  queueAndSync('project_notes', note.id, 'create', note, {
    endpoint: `/api/tasks/${payload.taskId}/notes`,
    method: 'POST',
    body: { id: note.id, content: note.content },
  })
  return note
}

export const deleteProjectNote = (id: string) => {
  updateTasksCache(tasks => tasks.map(t =>
    t.projectNotes ? { ...t, projectNotes: t.projectNotes.filter(n => n.id !== id) } : t
  ))
  queueAndSync('project_notes', id, 'delete', null, { endpoint: `/api/tasks/notes/${id}`, method: 'DELETE' })
}
