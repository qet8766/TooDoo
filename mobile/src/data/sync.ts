import { AppState, type AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import type { Task, ProjectNote, Note } from '@shared/types'
import {
  toTaskRow,
  fromTaskRow,
  toProjectNoteRow,
  fromProjectNoteRow,
  toNoteRow,
  fromNoteRow,
} from '@shared/supabase-types'
import { readJson, writeJson } from './persistence'
import { getClient, getUserId, getAuthStatus } from './supabase'

type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

const META_KEY = '@toodoo/sync-meta'

let syncStatus: SyncStatus = 'offline'
let lastSyncedAt = 0
let wasOnline = false
let pushChain: Promise<void> = Promise.resolve()

// Callbacks injected by stores — avoids circular dependency
let getAllTasksRaw: () => Task[] = () => []
let replaceTaskCache: (tasks: Task[]) => void = () => {}
let getAllNotesRaw: () => Note[] = () => []
let replaceNoteCache: (notes: Note[]) => void = () => {}
let enqueue: <T>(fn: () => T) => Promise<T> = (fn) => Promise.resolve(fn())

// Status change listeners
type StatusListener = (status: SyncStatus) => void
const statusListeners: Set<StatusListener> = new Set()

export const onSyncStatusChanged = (fn: StatusListener): (() => void) => {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

export const getSyncStatus = (): SyncStatus => syncStatus

const setSyncStatus = (status: SyncStatus): void => {
  if (status === syncStatus) return
  syncStatus = status
  statusListeners.forEach((fn) => fn(status))
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

const doUpsert = async (type: 'task' | 'projectNote' | 'note', entity: Task | ProjectNote | Note): Promise<boolean> => {
  const uid = getUserId()!
  const client = getClient()

  try {
    if (type === 'task') {
      const row = toTaskRow(entity as Task, uid)
      const { error } = await client.from('tasks').upsert(row)
      if (error) {
        console.warn('Push task failed:', error.message)
        return false
      }
    } else if (type === 'projectNote') {
      const row = toProjectNoteRow(entity as ProjectNote, uid)
      const { error } = await client.from('project_notes').upsert(row)
      if (error) {
        console.warn('Push projectNote failed:', error.message)
        return false
      }
    } else {
      const row = toNoteRow(entity as Note, uid)
      const { error } = await client.from('notes').upsert(row)
      if (error) {
        console.warn('Push note failed:', error.message)
        return false
      }
    }
    return true
  } catch (err) {
    console.warn(`Push ${type} error:`, err)
    return false
  }
}

export const pushEntity = (type: 'task' | 'projectNote' | 'note', entity: Task | ProjectNote | Note): void => {
  if (!getAuthStatus().isSignedIn) return

  // Check connectivity asynchronously — fire and forget
  NetInfo.fetch().then((state) => {
    if (!state.isConnected) return
    pushChain = pushChain.then(async () => {
      await doUpsert(type, entity)
    })
  })
}

// --- Pull ---

const mergeProjectNotes = (local: ProjectNote[], remote: ProjectNote[]): ProjectNote[] | undefined => {
  const merged: ProjectNote[] = []
  const seenIds = new Set<string>()

  for (const ln of local) {
    seenIds.add(ln.id)
    const rn = remote.find((r) => r.id === ln.id)
    if (rn && rn.updatedAt >= ln.updatedAt) {
      merged.push(rn)
    } else {
      merged.push(ln)
    }
  }

  for (const rn of remote) {
    if (!seenIds.has(rn.id)) merged.push(rn)
  }

  return merged.length > 0 ? merged : undefined
}

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
      setSyncStatus('error')
      return
    }

    const remoteTasks = (tasksRes.data ?? []).map(fromTaskRow)
    const remoteProjectNotes = (projectNotesRes.data ?? []).map(fromProjectNoteRow)
    const remoteNotes = (notesRes.data ?? []).map(fromNoteRow)

    // Group remote project notes by taskId
    const remoteNotesByTask = new Map<string, ProjectNote[]>()
    for (const pn of remoteProjectNotes) {
      const existing = remoteNotesByTask.get(pn.taskId) ?? []
      existing.push(pn)
      remoteNotesByTask.set(pn.taskId, existing)
    }

    await enqueue(() => {
      // --- Merge tasks ---
      const localTasks = getAllTasksRaw()
      const mergedTasks: Task[] = []
      const seenTaskIds = new Set<string>()

      for (const local of localTasks) {
        seenTaskIds.add(local.id)
        const remote = remoteTasks.find((t) => t.id === local.id)
        if (remote && remote.updatedAt >= local.updatedAt) {
          const mergedNotes = mergeProjectNotes(local.projectNotes ?? [], remoteNotesByTask.get(local.id) ?? [])
          mergedTasks.push({ ...remote, projectNotes: mergedNotes })
        } else {
          const remoteNotesForTask = remoteNotesByTask.get(local.id) ?? []
          if (remoteNotesForTask.length > 0) {
            const mergedNotes = mergeProjectNotes(local.projectNotes ?? [], remoteNotesForTask)
            mergedTasks.push({ ...local, projectNotes: mergedNotes })
          } else {
            mergedTasks.push(local)
          }
        }
      }

      for (const remote of remoteTasks) {
        if (!seenTaskIds.has(remote.id)) {
          const notes = remoteNotesByTask.get(remote.id) ?? []
          mergedTasks.push({ ...remote, projectNotes: notes.length > 0 ? notes : undefined })
        }
      }

      replaceTaskCache(mergedTasks)

      // --- Merge notes ---
      const localNotes = getAllNotesRaw()
      const mergedNotes: Note[] = []
      const seenNoteIds = new Set<string>()

      for (const local of localNotes) {
        seenNoteIds.add(local.id)
        const remote = remoteNotes.find((n) => n.id === local.id)
        if (remote && remote.updatedAt >= local.updatedAt) {
          mergedNotes.push(remote)
        } else {
          mergedNotes.push(local)
        }
      }

      for (const remote of remoteNotes) {
        if (!seenNoteIds.has(remote.id)) mergedNotes.push(remote)
      }

      replaceNoteCache(mergedNotes)
    })

    setSyncStatus('synced')
  } catch (err) {
    console.warn('Pull error:', err)
    setSyncStatus('error')
  }
}

// --- Dirty Push + Pull ---

const syncDirtyAndPull = async (): Promise<void> => {
  const netState = await NetInfo.fetch()
  if (!netState.isConnected || !getAuthStatus().isSignedIn) return

  setSyncStatus('syncing')
  let hadFailures = false

  try {
    const allTasks = getAllTasksRaw()
    for (const task of allTasks) {
      if (task.updatedAt > lastSyncedAt) {
        if (!(await doUpsert('task', task))) hadFailures = true
        for (const pn of task.projectNotes ?? []) {
          if (pn.updatedAt > lastSyncedAt) {
            if (!(await doUpsert('projectNote', pn))) hadFailures = true
          }
        }
      }
    }

    const allNotes = getAllNotesRaw()
    for (const note of allNotes) {
      if (note.updatedAt > lastSyncedAt) {
        if (!(await doUpsert('note', note))) hadFailures = true
      }
    }

    await pull()

    if (!hadFailures) {
      lastSyncedAt = Date.now()
      await saveMeta()
    }
  } catch (err) {
    console.warn('Dirty sync error:', err)
    setSyncStatus('error')
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

  loadMeta()

  // Sync on app foreground: push dirty entities then pull.
  // Using syncDirtyAndPull instead of just pull ensures that transient
  // online push failures get retried on every focus, not only on
  // offline→online transitions.
  appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') syncDirtyAndPull()
  })

  // Connectivity monitoring (equivalent to Electron's net.isOnline polling)
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

  // Check initial connectivity
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
