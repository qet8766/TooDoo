import { AppState, type AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import type { Task, ProjectNote, Note } from '@shared/types'
import type { SyncReason } from '@shared/ipc'
import {
  toTaskRow,
  fromTaskRow,
  toProjectNoteRow,
  fromProjectNoteRow,
  toNoteRow,
  fromNoteRow,
} from '@shared/supabase-types'
import { mergeByUpdatedAt } from '@shared/merge'
import { readJson, writeJson } from './persistence'
import { getClient, getUserId, getAuthStatus, markAuthExpired } from './supabase'

type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error' | 'auth-expired'
type UpsertResult = { ok: true } | { ok: false; reason: SyncReason }

const META_KEY = '@toodoo/sync-meta'

let syncStatus: SyncStatus = 'offline'
let syncReason: SyncReason | undefined = undefined
let lastSyncedAt = 0
let wasOnline = false
let pushChain: Promise<void> = Promise.resolve()
const dirtyIds = new Set<string>()

// Callbacks injected by stores — avoids circular dependency.
let getAllTasksRaw: () => Task[] = () => []
let replaceTaskCache: (tasks: Task[]) => void = () => {}
let getAllNotesRaw: () => Note[] = () => []
let replaceNoteCache: (notes: Note[]) => void = () => {}
let enqueue: <T>(fn: () => T) => Promise<T> = (fn) => Promise.resolve(fn())

// --- Status ---

type StatusListener = (status: SyncStatus, reason?: SyncReason) => void
const statusListeners: Set<StatusListener> = new Set()

export const onSyncStatusChanged = (fn: StatusListener): (() => void) => {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

export const getSyncStatus = (): SyncStatus => syncStatus
export const getSyncReason = (): SyncReason | undefined => syncReason
export const getDirtyCount = (): number => dirtyIds.size

const setSyncStatus = (status: SyncStatus, reason?: SyncReason): void => {
  if (status === syncStatus && reason === syncReason) return
  syncStatus = status
  syncReason = reason
  statusListeners.forEach((fn) => fn(status, reason))
}

// --- Error classification (parity with desktop sync.ts) ---

const classifyPostgrestError = (error: { code?: string; message?: string }): SyncReason => {
  const msg = (error.message ?? '').toLowerCase()
  const code = error.code ?? ''
  if (code === 'PGRST301' || code === '42501') return 'auth'
  if (msg.includes('jwt') || msg.includes('unauthor') || msg.includes('invalid api key')) return 'auth'
  if (code.startsWith('23')) return 'validation'
  return 'unknown'
}

const classifyException = (err: unknown): SyncReason => {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (err.name === 'AbortError' || msg.includes('fetch') || msg.includes('network')) return 'network'
  }
  return 'unknown'
}

// --- Auth health check (parity with desktop) ---

const AUTH_CHECK_COOLDOWN_MS = 30_000
let lastAuthCheckAt = 0

const checkAuthHealth = async (): Promise<void> => {
  try {
    const client = getClient()
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) {
      setSyncStatus('auth-expired')
      await markAuthExpired()
    }
  } catch {
    // Network error during check — not an auth problem, ignore.
  }
}

const maybeCheckAuth = (): void => {
  if (Date.now() - lastAuthCheckAt > AUTH_CHECK_COOLDOWN_MS) {
    lastAuthCheckAt = Date.now()
    void checkAuthHealth()
  }
}

// --- Persistence ---

const loadMeta = async (): Promise<void> => {
  const raw = await readJson<{ lastSyncedAt: number }>(META_KEY)
  if (raw && typeof raw.lastSyncedAt === 'number') {
    lastSyncedAt = raw.lastSyncedAt
  }
}

const saveMeta = async (): Promise<void> => {
  await writeJson(META_KEY, { lastSyncedAt })
}

// --- Push ---

const doUpsert = async (
  type: 'task' | 'projectNote' | 'note',
  entity: Task | ProjectNote | Note,
): Promise<UpsertResult> => {
  const uid = getUserId()!
  const client = getClient()

  try {
    const table = type === 'task' ? 'tasks' : type === 'projectNote' ? 'project_notes' : 'notes'
    const row =
      type === 'task'
        ? toTaskRow(entity as Task, uid)
        : type === 'projectNote'
          ? toProjectNoteRow(entity as ProjectNote, uid)
          : toNoteRow(entity as Note, uid)

    const { error } = await client.from(table).upsert(row)
    if (error) {
      const reason = classifyPostgrestError(error)
      console.warn(`Push ${type} failed (${reason}):`, error.message)
      return { ok: false, reason }
    }
    return { ok: true }
  } catch (err) {
    const reason = classifyException(err)
    console.warn(`Push ${type} error (${reason}):`, err)
    return { ok: false, reason }
  }
}

// Serialized fire-and-forget. Connectivity is checked INSIDE the push chain
// (not before enqueuing) so mutations that happen while offline still land in
// the chain; the chain step itself bails early if still offline, and the
// entity is already marked dirty by the time the chain runs.
export const pushEntity = (type: 'task' | 'projectNote' | 'note', entity: Task | ProjectNote | Note): void => {
  if (!getAuthStatus().isSignedIn) return
  dirtyIds.add(entity.id)

  pushChain = pushChain.then(async () => {
    const net = await NetInfo.fetch()
    if (!net.isConnected) return // stays dirty; next online transition or foreground will retry

    const result = await doUpsert(type, entity)
    if (result.ok) {
      dirtyIds.delete(entity.id)
      if (dirtyIds.size === 0) setSyncStatus('synced')
    } else {
      setSyncStatus('error', result.reason)
      if (result.reason === 'auth') maybeCheckAuth()
    }
  })
}

// --- Pull ---

export const pull = async (): Promise<void> => {
  const netState = await NetInfo.fetch()
  if (!netState.isConnected || !getAuthStatus().isSignedIn) return

  setSyncStatus('syncing')

  try {
    const client = getClient()

    const [tasksRes, projectNotesRes, notesRes] = await Promise.all([
      client.from('tasks').select('*'),
      client.from('project_notes').select('*'),
      client.from('notes').select('*'),
    ])

    if (tasksRes.error || projectNotesRes.error || notesRes.error) {
      console.warn(
        'Pull fetch error:',
        tasksRes.error?.message,
        projectNotesRes.error?.message,
        notesRes.error?.message,
      )
      const firstError = tasksRes.error ?? projectNotesRes.error ?? notesRes.error
      const reason = firstError ? classifyPostgrestError(firstError) : 'unknown'
      setSyncStatus('error', reason)
      if (reason === 'auth') maybeCheckAuth()
      return
    }

    const remoteTasks = (tasksRes.data ?? []).map(fromTaskRow)
    const remoteProjectNotes = (projectNotesRes.data ?? []).map(fromProjectNoteRow)
    const remoteNotes = (notesRes.data ?? []).map(fromNoteRow)

    const remoteNotesByTask = new Map<string, ProjectNote[]>()
    for (const pn of remoteProjectNotes) {
      const existing = remoteNotesByTask.get(pn.taskId) ?? []
      existing.push(pn)
      remoteNotesByTask.set(pn.taskId, existing)
    }

    await enqueue(() => {
      // Project notes merge runs independently of the parent task merge so
      // that cross-device note-only edits survive even when the parent task
      // is stale.
      const localTasks = getAllTasksRaw()
      const localTasksById = new Map(localTasks.map((t) => [t.id, t]))

      const mergedTasks = mergeByUpdatedAt(localTasks, remoteTasks).map((task) => {
        const localPns = localTasksById.get(task.id)?.projectNotes ?? []
        const remotePns = remoteNotesByTask.get(task.id) ?? []
        const mergedPns = mergeByUpdatedAt(localPns, remotePns)
        return { ...task, projectNotes: mergedPns.length > 0 ? mergedPns : undefined }
      })

      replaceTaskCache(mergedTasks)
      replaceNoteCache(mergeByUpdatedAt(getAllNotesRaw(), remoteNotes))
    })

    setSyncStatus('synced')
  } catch (err) {
    console.warn('Pull error:', err)
    setSyncStatus('error', classifyException(err))
  }
}

// --- Dirty Push + Pull ---

const syncDirtyAndPull = async (): Promise<void> => {
  const netState = await NetInfo.fetch()
  if (!netState.isConnected || !getAuthStatus().isSignedIn) return

  setSyncStatus('syncing')

  let firstFailureReason: SyncReason | null = null
  const track = (r: UpsertResult): void => {
    if (!r.ok && firstFailureReason === null) firstFailureReason = r.reason
  }

  try {
    const allTasks = getAllTasksRaw()
    for (const task of allTasks) {
      if (task.updatedAt > lastSyncedAt) {
        track(await doUpsert('task', task))
        for (const pn of task.projectNotes ?? []) {
          if (pn.updatedAt > lastSyncedAt) {
            track(await doUpsert('projectNote', pn))
          }
        }
      }
    }

    const allNotes = getAllNotesRaw()
    for (const note of allNotes) {
      if (note.updatedAt > lastSyncedAt) {
        track(await doUpsert('note', note))
      }
    }

    await pull()

    if (firstFailureReason === null) {
      dirtyIds.clear()
      lastSyncedAt = Date.now()
      await saveMeta()
    } else {
      setSyncStatus('error', firstFailureReason)
      if (firstFailureReason === 'auth') maybeCheckAuth()
    }
  } catch (err) {
    console.warn('Dirty sync error:', err)
    setSyncStatus('error', classifyException(err))
  }
}

// --- Lifecycle ---

let unsubscribeNetInfo: (() => void) | null = null
let appStateSubscription: { remove: () => void } | null = null

export const initSync = (deps: {
  getAllTasksRaw: () => Task[]
  replaceTaskCache: (tasks: Task[]) => void
  getAllNotesRaw: () => Note[]
  replaceNoteCache: (notes: Note[]) => void
  enqueue: <T>(fn: () => T) => Promise<T>
}): void => {
  getAllTasksRaw = deps.getAllTasksRaw
  replaceTaskCache = deps.replaceTaskCache
  getAllNotesRaw = deps.getAllNotesRaw
  replaceNoteCache = deps.replaceNoteCache
  enqueue = deps.enqueue
  pushChain = Promise.resolve()
  dirtyIds.clear()
  lastAuthCheckAt = 0

  loadMeta()

  // Sync on app foreground: push dirty entities then pull.
  appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') syncDirtyAndPull()
  })

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const isOnline = !!state.isConnected

    if (isOnline && !wasOnline && getAuthStatus().isSignedIn) {
      syncDirtyAndPull()
    }

    if (isOnline !== wasOnline) {
      wasOnline = isOnline
      if (!isOnline) setSyncStatus('offline')
    }
  })

  NetInfo.fetch().then((state) => {
    wasOnline = !!state.isConnected
    if (!wasOnline) setSyncStatus('offline')
  })
}

export const teardownSync = (): void => {
  unsubscribeNetInfo?.()
  unsubscribeNetInfo = null
  appStateSubscription?.remove()
  appStateSubscription = null
}
