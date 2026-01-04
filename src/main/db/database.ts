import fs from 'node:fs'
import path from 'node:path'
import { app } from '../electron'
import type { Note, ProjectNote, Task, TaskCategory } from '@shared/types'
import { ALL_CATEGORIES } from '@shared/categories'
import {
  getNasPath,
  getNasStorePath,
  getNasLockPath,
  getLocalCachePath,
  getMachineId,
  setLastSyncAt,
  getLastSyncAt,
} from './config'
import { acquireLock, releaseLock } from './file-lock'

// --- Constants & Types ---

const SYNC_INTERVAL_MS = 5_000
const SYNC_DEBOUNCE_MS = 1_000  // Debounce rapid sync triggers
const MAX_PAYLOAD_SIZE = 100_000

// Circuit breaker constants
const MAX_CONSECUTIVE_ERRORS = 5
const MIN_BACKOFF_MS = 30_000       // Start with 30s
const MAX_BACKOFF_MS = 5 * 60_000   // Max 5 minutes

type PendingChange = {
  id: string
  table: 'tasks' | 'project_notes' | 'notes'
  recordId: string
  operation: 'create' | 'update' | 'delete'
  timestamp: number
}

type LocalCache = {
  tasks: Task[]
  notes: Note[]
  pendingChanges: PendingChange[]
  lastNasSyncAt: number
}

// --- Cache State ---

let cache: LocalCache | null = null
let cachePath: string | null = null

const getDefaultCache = (): LocalCache => ({
  tasks: [],
  notes: [],
  pendingChanges: [],
  lastNasSyncAt: 0,
})

// --- Cache Persistence ---

const loadCache = (): LocalCache => {
  if (cache) return cache

  cachePath = getLocalCachePath()

  // Ensure directory exists
  const cacheDir = path.dirname(cachePath)
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }

  // Migrate from old store if it exists
  migrateFromOldStore()

  try {
    cache = fs.existsSync(cachePath)
      ? { ...getDefaultCache(), ...JSON.parse(fs.readFileSync(cachePath, 'utf-8')) }
      : getDefaultCache()
  } catch (err) {
    console.error('Failed to load cache, using defaults:', err)
    cache = getDefaultCache()
  }

  // Run category migration
  runCategoryMigration()

  return cache!
}

const saveCache = () => {
  if (cache && cachePath) {
    try {
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2))
    } catch (err) {
      console.error('Failed to save cache:', err)
    }
  }
}

const ensureCache = () => {
  if (!cache) loadCache()
  return cache!
}

const updateTasksCache = (fn: (tasks: Task[]) => Task[]) => {
  ensureCache().tasks = fn(ensureCache().tasks)
  saveCache()
}

const updateNotesCache = (fn: (notes: Note[]) => Note[]) => {
  ensureCache().notes = fn(ensureCache().notes)
  saveCache()
}

// --- Migration from Old Store ---

const migrateFromOldStore = () => {
  if (!cachePath) return

  const userDataDir = app.getPath('userData')
  const oldStorePath = path.join(userDataDir, 'toodoo-store.json')

  // If cache already exists, no need to migrate
  if (fs.existsSync(cachePath)) return

  // Check for old local store
  if (fs.existsSync(oldStorePath)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(oldStorePath, 'utf-8'))
      if (oldData.cache) {
        cache = {
          tasks: oldData.cache.tasks || [],
          notes: oldData.cache.notes || [],
          pendingChanges: [],
          lastNasSyncAt: 0,
        }
        saveCache()
        // Rename old file to backup
        fs.renameSync(oldStorePath, `${oldStorePath}.migrated-${Date.now()}`)
        console.log('Migrated data from old store to new cache format')
      }
    } catch (err) {
      console.error('Failed to migrate old store:', err)
    }
  }
}

// --- Category Migration ---

const runCategoryMigration = () => {
  if (!cache) return

  const categoryMap: Record<string, TaskCategory> = {
    'short_term': 'hot',
    'long_term': 'warm',
    'immediate': 'scorching',
  }

  let migrated = false
  cache.tasks = cache.tasks.map(task => {
    const oldCategory = task.category as string
    if (oldCategory in categoryMap) {
      migrated = true
      return { ...task, category: categoryMap[oldCategory] }
    }
    return task
  })

  if (migrated) {
    console.log('Migrated task categories from old naming to new naming')
    saveCache()
  }
}

// --- Pending Changes Tracking ---

const addPendingChange = (table: 'tasks' | 'project_notes' | 'notes', recordId: string, operation: 'create' | 'update' | 'delete') => {
  const c = ensureCache()

  // Remove any existing pending change for this record
  c.pendingChanges = c.pendingChanges.filter(p => !(p.table === table && p.recordId === recordId))

  // Add new pending change
  c.pendingChanges.push({
    id: crypto.randomUUID(),
    table,
    recordId,
    operation,
    timestamp: Date.now(),
  })

  saveCache()
}

const clearPendingChanges = () => {
  ensureCache().pendingChanges = []
  saveCache()
}

// --- NAS Operations ---

type NasStore = {
  tasks: Task[]
  notes: Note[]
  lastModifiedAt: number
  lastModifiedBy: string
}

const getDefaultNasStore = (): NasStore => ({
  tasks: [],
  notes: [],
  lastModifiedAt: 0,
  lastModifiedBy: '',
})

const readFromNas = async (): Promise<NasStore | null> => {
  const nasStorePath = getNasStorePath()
  if (!nasStorePath) return null

  try {
    if (!fs.existsSync(nasStorePath)) {
      return getDefaultNasStore()
    }
    const content = fs.readFileSync(nasStorePath, 'utf-8')
    return JSON.parse(content) as NasStore
  } catch (err) {
    console.error('Failed to read from NAS:', err)
    return null
  }
}

const writeToNas = async (store: NasStore): Promise<boolean> => {
  const nasStorePath = getNasStorePath()
  if (!nasStorePath) return false

  try {
    // Ensure NAS directory exists
    const nasDir = path.dirname(nasStorePath)
    if (!fs.existsSync(nasDir)) {
      fs.mkdirSync(nasDir, { recursive: true })
    }

    // Write atomically using temp file
    const tempPath = `${nasStorePath}.${getMachineId()}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2))
    fs.renameSync(tempPath, nasStorePath)
    return true
  } catch (err) {
    console.error('Failed to write to NAS:', err)
    return false
  }
}

// --- Sync Logic ---

let isNasOnline = false
let syncInProgress = false
let syncInterval: ReturnType<typeof setInterval> | null = null
let syncDebounceTimeout: ReturnType<typeof setTimeout> | null = null
let syncErrorCount = 0
let currentBackoffMs = MIN_BACKOFF_MS
let circuitBreakerOpen = false
let circuitBreakerResetTime = 0

const mergeData = (local: LocalCache, nas: NasStore): { tasks: Task[]; notes: Note[] } => {
  // Create maps for efficient lookup
  const nasTaskMap = new Map(nas.tasks.map(t => [t.id, t]))
  const nasNoteMap = new Map(nas.notes.map(n => [n.id, n]))
  const localTaskMap = new Map(local.tasks.map(t => [t.id, t]))
  const localNoteMap = new Map(local.notes.map(n => [n.id, n]))

  // Get IDs of records with pending changes
  const pendingTaskIds = new Set(
    local.pendingChanges.filter(p => p.table === 'tasks').map(p => p.recordId)
  )
  const pendingNoteIds = new Set(
    local.pendingChanges.filter(p => p.table === 'notes').map(p => p.recordId)
  )

  // Merge tasks: LWW with pending changes preserved
  const mergedTasks: Task[] = []
  const allTaskIds = new Set([...nasTaskMap.keys(), ...localTaskMap.keys()])

  for (const id of allTaskIds) {
    const nasTask = nasTaskMap.get(id)
    const localTask = localTaskMap.get(id)

    if (pendingTaskIds.has(id)) {
      // Local has pending changes - keep local version
      if (localTask) {
        mergedTasks.push(localTask)
      }
      // If local deleted, don't include
    } else if (nasTask && localTask) {
      // Both exist, no pending change - use newer one (LWW)
      mergedTasks.push(nasTask.updatedAt >= localTask.updatedAt ? nasTask : localTask)
    } else if (nasTask) {
      mergedTasks.push(nasTask)
    } else if (localTask) {
      mergedTasks.push(localTask)
    }
  }

  // Merge notes: same logic
  const mergedNotes: Note[] = []
  const allNoteIds = new Set([...nasNoteMap.keys(), ...localNoteMap.keys()])

  for (const id of allNoteIds) {
    const nasNote = nasNoteMap.get(id)
    const localNote = localNoteMap.get(id)

    if (pendingNoteIds.has(id)) {
      if (localNote) {
        mergedNotes.push(localNote)
      }
    } else if (nasNote && localNote) {
      mergedNotes.push(nasNote.updatedAt >= localNote.updatedAt ? nasNote : localNote)
    } else if (nasNote) {
      mergedNotes.push(nasNote)
    } else if (localNote) {
      mergedNotes.push(localNote)
    }
  }

  return { tasks: mergedTasks, notes: mergedNotes }
}

const syncWithNas = async (): Promise<boolean> => {
  const nasPath = getNasPath()
  if (!nasPath) {
    isNasOnline = false
    return false
  }

  const nasLockPath = getNasLockPath()
  if (!nasLockPath) {
    isNasOnline = false
    return false
  }

  const machineId = getMachineId()

  // Try to acquire lock
  const { acquired, error } = await acquireLock(nasLockPath, machineId)
  if (!acquired) {
    console.warn('Could not acquire NAS lock:', error)
    // NAS might still be online, just locked
    isNasOnline = true
    return false
  }

  try {
    // Read current NAS data
    const nasData = await readFromNas()
    if (nasData === null) {
      isNasOnline = false
      return false
    }

    isNasOnline = true
    const localCache = ensureCache()

    // If we have pending changes, merge and write back
    if (localCache.pendingChanges.length > 0) {
      const pendingCount = localCache.pendingChanges.length
      const merged = mergeData(localCache, nasData)

      // Update NAS with merged data
      const newNasStore: NasStore = {
        tasks: merged.tasks,
        notes: merged.notes,
        lastModifiedAt: Date.now(),
        lastModifiedBy: machineId,
      }

      const writeSuccess = await writeToNas(newNasStore)
      if (writeSuccess) {
        // Update local cache with merged data
        localCache.tasks = merged.tasks
        localCache.notes = merged.notes
        localCache.lastNasSyncAt = Date.now()
        clearPendingChanges()
        saveCache()
        setLastSyncAt(Date.now())
        console.log(`Synced ${pendingCount} pending change(s) to NAS`)
      }

      return writeSuccess
    } else {
      // No pending changes - silently update local cache from NAS
      localCache.tasks = nasData.tasks
      localCache.notes = nasData.notes
      localCache.lastNasSyncAt = Date.now()
      saveCache()
      setLastSyncAt(Date.now())
      return true
    }
  } catch (err) {
    console.error('Sync error:', err)
    return false
  } finally {
    releaseLock(nasLockPath, machineId)
  }
}

// --- Sync Scheduler ---

// Circuit breaker helpers
const onSyncSuccess = () => {
  syncErrorCount = 0
  currentBackoffMs = MIN_BACKOFF_MS
  circuitBreakerOpen = false
}

const onSyncFailure = (err?: unknown) => {
  syncErrorCount++
  if (err) console.error('Sync failed:', err)

  if (syncErrorCount >= MAX_CONSECUTIVE_ERRORS && !circuitBreakerOpen) {
    circuitBreakerOpen = true
    circuitBreakerResetTime = Date.now() + currentBackoffMs
    console.warn(`Circuit breaker opened: NAS sync failed ${syncErrorCount} times. Backing off for ${currentBackoffMs / 1000}s`)

    // Exponential backoff: double the wait time for next failure
    currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS)
  }
}

const isCircuitBreakerAllowing = (): boolean => {
  if (!circuitBreakerOpen) return true

  // Check if backoff period has passed
  if (Date.now() >= circuitBreakerResetTime) {
    // Half-open state: allow one attempt
    console.log('Circuit breaker half-open: attempting sync...')
    return true
  }

  return false
}

export const getSyncStatus = () => ({
  isOnline: isNasOnline,
  pendingCount: ensureCache().pendingChanges.length,
  lastSyncAt: getLastSyncAt(),
  circuitBreakerOpen,
  nextRetryAt: circuitBreakerOpen ? circuitBreakerResetTime : null,
})

export const startSyncScheduler = () => {
  if (syncInterval) return
  syncInterval = setInterval(() => {
    if (!syncInProgress && isCircuitBreakerAllowing()) {
      syncInProgress = true
      syncWithNas()
        .then(success => success ? onSyncSuccess() : onSyncFailure())
        .catch(err => onSyncFailure(err))
        .finally(() => { syncInProgress = false })
    }
  }, SYNC_INTERVAL_MS)
  // Initial sync
  syncInProgress = true
  syncWithNas()
    .then(success => success ? onSyncSuccess() : onSyncFailure())
    .catch(err => onSyncFailure(err))
    .finally(() => { syncInProgress = false })
}

export const stopSyncScheduler = () => {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

// Debounced sync trigger - coalesces rapid changes
const debouncedSync = () => {
  if (syncDebounceTimeout) {
    clearTimeout(syncDebounceTimeout)
  }
  syncDebounceTimeout = setTimeout(() => {
    syncDebounceTimeout = null
    if (!syncInProgress && isCircuitBreakerAllowing()) {
      syncInProgress = true
      syncWithNas()
        .then(success => success ? onSyncSuccess() : onSyncFailure())
        .catch(err => onSyncFailure(err))
        .finally(() => { syncInProgress = false })
    }
  }, SYNC_DEBOUNCE_MS)
}

export const triggerSync = async () => {
  if (syncInProgress) return
  if (!isCircuitBreakerAllowing()) {
    console.log('Sync blocked by circuit breaker, will retry at', new Date(circuitBreakerResetTime).toISOString())
    return
  }

  syncInProgress = true
  try {
    const success = await syncWithNas()
    success ? onSyncSuccess() : onSyncFailure()
  } catch (err) {
    onSyncFailure(err)
  } finally {
    syncInProgress = false
  }
}

// Force reset circuit breaker (e.g., when user manually retries)
export const resetCircuitBreaker = () => {
  circuitBreakerOpen = false
  syncErrorCount = 0
  currentBackoffMs = MIN_BACKOFF_MS
  console.log('Circuit breaker manually reset')
}

export const initDatabase = () => {
  loadCache()
  // Only start sync if NAS is configured
  if (getNasPath()) {
    startSyncScheduler()
  }
}

// --- Validation ---

const validate = (rules: [boolean, string][]): string | null => rules.find(([fail]) => fail)?.[1] ?? null

const validateTask = (p: { title?: string; description?: string | null; category?: TaskCategory }): string | null => validate([
  [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
  [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
  [typeof p.title === 'string' && p.title.length > 500, 'Title too long'],
  [p.description != null && typeof p.description !== 'string', 'Description must be a string'],
  [typeof p.description === 'string' && p.description.length > 5000, 'Description too long'],
  [p.category !== undefined && !ALL_CATEGORIES.includes(p.category), 'Invalid category'],
  [JSON.stringify(p).length > MAX_PAYLOAD_SIZE, 'Payload too large'],
])

const validateProjectNote = (p: { content: string }): string | null => validate([
  [typeof p.content !== 'string', 'Content must be a string'],
  [!p.content.trim(), 'Content cannot be empty'],
  [p.content.length > 10000, 'Content too long'],
])

const validateNotetankNote = (p: { title?: string; content?: string }): string | null => validate([
  [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
  [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
  [typeof p.title === 'string' && p.title.length > 200, 'Title too long'],
  [p.content !== undefined && typeof p.content !== 'string', 'Content must be a string'],
  [typeof p.content === 'string' && p.content.length > 50000, 'Content too long'],
])

// --- Tasks ---

export const getTasks = async (): Promise<Task[]> => {
  // Trigger a background sync but return cached data immediately
  if (!syncInProgress && getNasPath()) {
    syncInProgress = true
    syncWithNas()
      .catch(() => {})
      .finally(() => { syncInProgress = false })
  }
  return ensureCache().tasks
}

export const addTask = (p: { id: string; title: string; description?: string; category: TaskCategory; isDone?: boolean }): Task | { error: string } => {
  const err = validateTask(p)
  if (err) return { error: err }

  const now = Date.now()
  const task: Task = {
    id: p.id,
    title: p.title.trim(),
    description: p.description?.trim(),
    category: p.category,
    isDone: p.isDone ?? false,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  updateTasksCache(tasks => [task, ...tasks.filter(t => t.id !== task.id)])
  addPendingChange('tasks', task.id, 'create')

  // Trigger background sync
  debouncedSync()

  return task
}

export const updateTask = (p: { id: string; title?: string; description?: string | null; isDone?: boolean; category?: TaskCategory }): Task | null | { error: string } => {
  const err = validateTask(p)
  if (err) return { error: err }

  const existing = ensureCache().tasks.find(t => t.id === p.id)
  if (!existing) return null

  const updated: Task = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    description: p.description === null ? undefined : (p.description?.trim() ?? existing.description),
    category: p.category ?? existing.category,
    isDone: p.isDone ?? existing.isDone,
    updatedAt: Date.now(),
  }

  updateTasksCache(tasks => tasks.map(t => t.id === p.id ? updated : t))
  addPendingChange('tasks', p.id, 'update')

  // Trigger background sync
  debouncedSync()

  return updated
}

export const deleteTask = (id: string) => {
  updateTasksCache(tasks => tasks.filter(t => t.id !== id))
  addPendingChange('tasks', id, 'delete')

  // Trigger background sync
  debouncedSync()
}

// --- Project Notes ---

export const addProjectNote = (p: { id: string; taskId: string; content: string }): ProjectNote | { error: string } => {
  const err = validateProjectNote(p)
  if (err) return { error: err }
  if (!ensureCache().tasks.find(t => t.id === p.taskId)) return { error: 'Task not found' }

  const now = Date.now()
  const note: ProjectNote = {
    id: p.id,
    taskId: p.taskId,
    content: p.content.trim(),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  updateTasksCache(tasks => tasks.map(t =>
    t.id === p.taskId ? { ...t, projectNotes: [...(t.projectNotes || []), note] } : t
  ))
  addPendingChange('project_notes', note.id, 'create')

  // Trigger background sync
  debouncedSync()

  return note
}

export const updateProjectNote = (p: { id: string; content: string }): ProjectNote | null | { error: string } => {
  const err = validateProjectNote(p)
  if (err) return { error: err }

  let foundNote: ProjectNote | null = null
  let taskId: string | null = null
  for (const task of ensureCache().tasks) {
    const note = task.projectNotes?.find(n => n.id === p.id)
    if (note) { foundNote = note; taskId = task.id; break }
  }
  if (!foundNote || !taskId) return null

  const updated: ProjectNote = {
    ...foundNote,
    content: p.content.trim(),
    updatedAt: Date.now(),
  }

  updateTasksCache(tasks => tasks.map(t =>
    t.id === taskId
      ? { ...t, projectNotes: (t.projectNotes ?? []).map(n => n.id === p.id ? updated : n) }
      : t
  ))
  addPendingChange('project_notes', p.id, 'update')

  // Trigger background sync
  debouncedSync()

  return updated
}

export const deleteProjectNote = (id: string) => {
  updateTasksCache(tasks => tasks.map(t =>
    t.projectNotes ? { ...t, projectNotes: t.projectNotes.filter(n => n.id !== id) } : t
  ))
  addPendingChange('project_notes', id, 'delete')

  // Trigger background sync
  debouncedSync()
}

// --- Notetank Notes ---

export const getNotes = async (): Promise<Note[]> => {
  // Trigger a background sync but return cached data immediately
  if (!syncInProgress && getNasPath()) {
    syncInProgress = true
    syncWithNas()
      .catch(() => {})
      .finally(() => { syncInProgress = false })
  }
  return ensureCache().notes
}

export const addNote = (p: { id: string; title: string; content: string }): Note | { error: string } => {
  const err = validateNotetankNote(p)
  if (err) return { error: err }

  const now = Date.now()
  const note: Note = {
    id: p.id,
    title: p.title.trim(),
    content: p.content.trim(),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  updateNotesCache(notes => [note, ...notes.filter(n => n.id !== note.id)])
  addPendingChange('notes', note.id, 'create')

  // Trigger background sync
  debouncedSync()

  return note
}

export const updateNote = (p: { id: string; title?: string; content?: string }): Note | null | { error: string } => {
  const err = validateNotetankNote(p)
  if (err) return { error: err }

  const existing = ensureCache().notes.find(n => n.id === p.id)
  if (!existing) return null

  const updated: Note = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    content: p.content !== undefined ? p.content.trim() : existing.content,
    updatedAt: Date.now(),
  }

  updateNotesCache(notes => notes.map(n => n.id === p.id ? updated : n))
  addPendingChange('notes', p.id, 'update')

  // Trigger background sync
  debouncedSync()

  return updated
}

export const deleteNote = (id: string) => {
  updateNotesCache(notes => notes.filter(n => n.id !== id))
  addPendingChange('notes', id, 'delete')

  // Trigger background sync
  debouncedSync()
}

// --- Re-initialize after setup ---

export const reinitializeWithNas = () => {
  // Reload cache and start sync
  loadCache()
  if (getNasPath()) {
    startSyncScheduler()
  }
}
