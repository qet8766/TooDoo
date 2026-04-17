import path from 'node:path'
import type { Task, ProjectNote, Note } from '@shared/types'
import type { SyncReason, SyncStatusPayload } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import {
  toTaskRow,
  fromTaskRow,
  toProjectNoteRow,
  fromProjectNoteRow,
  toNoteRow,
  fromNoteRow,
} from '@shared/supabase-types'
import { mergeByUpdatedAt } from '@shared/merge'
import { readJsonFile, writeJsonFile } from '../store'
import * as taskOps from '../tasks'
import * as noteOps from '../notes'
import { getClient, getUserId, getAuthStatus, isSyncDisabled } from './supabase'
import { broadcast, broadcastTaskChange, broadcastNotesChange } from '../../broadcast'
import { app, net } from '../../electron'

type SyncStatus = SyncStatusPayload['status']
type UpsertResult = { ok: true } | { ok: false; reason: SyncReason }

let syncStatus: SyncStatus = 'offline'
let syncReason: SyncReason | undefined = undefined
let lastSyncedAt = 0
let metaFilePath = ''
let wasOnline = false
let enqueue: <T>(fn: () => T) => Promise<T>
let pushChain: Promise<void> = Promise.resolve()
let syncLock = false
const dirtyIds = new Set<string>()

const CONNECTIVITY_POLL_MS = 30_000

// --- Status ---

export const getSyncStatus = (): SyncStatus => syncStatus
export const getSyncReason = (): SyncReason | undefined => syncReason

const setSyncStatus = (status: SyncStatus, reason?: SyncReason): void => {
  if (status === syncStatus && reason === syncReason) return
  syncStatus = status
  syncReason = reason
  broadcast(IPC.SYNC_STATUS_CHANGED, { status, reason } satisfies SyncStatusPayload)
}

// --- Error classification ---

/**
 * Map a Supabase PostgrestError to a SyncReason. The PostgrestError shape
 * exposes a `code` (5-char Postgres SQLSTATE or a PostgREST-specific prefix)
 * and a `message`. Auth issues commonly surface via JWT-related messages or
 * PostgREST's PGRST301 (JWT missing/invalid). Integrity violations use
 * Postgres's `23xxx` class. Anything else is left as `'unknown'`.
 */
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

// --- Persistence ---

const loadMeta = (): void => {
  const raw = readJsonFile(metaFilePath)
  if (raw && typeof raw === 'object' && 'lastSyncedAt' in raw) {
    lastSyncedAt = (raw as { lastSyncedAt: number }).lastSyncedAt
  }
}

const saveMeta = (): void => {
  writeJsonFile(metaFilePath, { lastSyncedAt })
}

// --- Auth Health Check ---

const AUTH_CHECK_COOLDOWN_MS = 30_000
let lastAuthCheckAt = 0

const checkAuthHealth = async (): Promise<void> => {
  try {
    const client = getClient()
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) {
      setSyncStatus('auth-expired')
      broadcast(IPC.AUTH_STATUS_CHANGED, { isSignedIn: false, userId: null })
    }
  } catch {
    // Network error during check — not an auth problem, ignore
  }
}

const maybeCheckAuth = (): void => {
  if (Date.now() - lastAuthCheckAt > AUTH_CHECK_COOLDOWN_MS) {
    lastAuthCheckAt = Date.now()
    checkAuthHealth()
  }
}

// --- Push ---

const doUpsert = async (
  type: 'task' | 'projectNote' | 'note',
  entity: Task | ProjectNote | Note,
): Promise<UpsertResult> => {
  const userId = getUserId()!
  const client = getClient()

  try {
    const table = type === 'task' ? 'tasks' : type === 'projectNote' ? 'project_notes' : 'notes'
    const row =
      type === 'task'
        ? toTaskRow(entity as Task, userId)
        : type === 'projectNote'
          ? toProjectNoteRow(entity as ProjectNote, userId)
          : toNoteRow(entity as Note, userId)

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

// Serialized fire-and-forget: each push waits for the previous one to complete,
// preventing out-of-order writes to the same entity from network latency.
export const pushEntity = (type: 'task' | 'projectNote' | 'note', entity: Task | ProjectNote | Note): void => {
  if (!net.isOnline() || !getAuthStatus().isSignedIn) return
  pushChain = pushChain.then(async () => {
    const result = await doUpsert(type, entity)
    if (result.ok) {
      dirtyIds.delete(entity.id)
      if (dirtyIds.size === 0) setSyncStatus('synced')
    } else {
      dirtyIds.add(entity.id)
      setSyncStatus('error', result.reason)
      if (result.reason === 'auth') maybeCheckAuth()
    }
  })
}

export const getDirtyCount = (): number => dirtyIds.size

// --- Pull ---

const pullInternal = async (): Promise<void> => {
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

    // Group remote project notes by taskId
    const remoteNotesByTask = new Map<string, ProjectNote[]>()
    for (const pn of remoteProjectNotes) {
      const existing = remoteNotesByTask.get(pn.taskId) ?? []
      existing.push(pn)
      remoteNotesByTask.set(pn.taskId, existing)
    }

    await enqueue(() => {
      // --- Merge tasks ---
      // Project notes merge runs independently of the parent task merge so
      // that cross-device note-only edits survive even when the parent task
      // is stale.
      const localTasks = taskOps.getAllTasksRaw()
      const localTasksById = new Map(localTasks.map((t) => [t.id, t]))

      const mergedTasks = mergeByUpdatedAt(localTasks, remoteTasks).map((task) => {
        const localPns = localTasksById.get(task.id)?.projectNotes ?? []
        const remotePns = remoteNotesByTask.get(task.id) ?? []
        const mergedPns = mergeByUpdatedAt(localPns, remotePns)
        return { ...task, projectNotes: mergedPns.length > 0 ? mergedPns : undefined }
      })

      taskOps.replaceCache(mergedTasks)

      // --- Merge notes ---
      const mergedNotes = mergeByUpdatedAt(noteOps.getAllNotesRaw(), remoteNotes)
      noteOps.replaceCache(mergedNotes)
    })

    broadcastTaskChange()
    broadcastNotesChange()
    setSyncStatus('synced')
  } catch (err) {
    console.warn('Pull error:', err)
    setSyncStatus('error', classifyException(err))
  }
}

export const pull = async (): Promise<void> => {
  if (!net.isOnline() || !getAuthStatus().isSignedIn) return
  if (syncLock) return

  syncLock = true
  try {
    await pullInternal()
  } finally {
    syncLock = false
  }
}

// --- Dirty Push + Pull ---

export const syncDirtyAndPull = async (): Promise<void> => {
  if (!net.isOnline() || !getAuthStatus().isSignedIn) return
  if (syncLock) return

  syncLock = true
  try {
    setSyncStatus('syncing')

    // Track the first failure's reason; if anything fails we surface it via
    // the error status instead of overwriting with 'synced' after pullInternal.
    let firstFailureReason: SyncReason | null = null
    const track = (r: UpsertResult): void => {
      if (!r.ok && firstFailureReason === null) firstFailureReason = r.reason
    }

    // Push dirty tasks and their project notes
    const allTasks = taskOps.getAllTasksRaw()
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

    // Push dirty notes
    const allNotes = noteOps.getAllNotesRaw()
    for (const note of allNotes) {
      if (note.updatedAt > lastSyncedAt) {
        track(await doUpsert('note', note))
      }
    }

    // Pull remote changes (this may end with setSyncStatus('synced'))
    await pullInternal()

    // Only advance watermark if every push succeeded
    if (firstFailureReason === null) {
      dirtyIds.clear()
      lastSyncedAt = Date.now()
      saveMeta()
    } else {
      setSyncStatus('error', firstFailureReason)
      if (firstFailureReason === 'auth') maybeCheckAuth()
    }
  } catch (err) {
    console.warn('Dirty sync error:', err)
    setSyncStatus('error', classifyException(err))
  } finally {
    syncLock = false
  }
}

// --- Connectivity Polling ---

const pollConnectivity = (): void => {
  const isOnline = net.isOnline()

  if (isOnline && !wasOnline && getAuthStatus().isSignedIn) {
    syncDirtyAndPull()
  }

  if (isOnline !== wasOnline) {
    wasOnline = isOnline
    if (!isOnline) setSyncStatus('offline')
  }
}

// --- Initialization ---

export const initSync = (userDataPath: string, enqueueFn: <T>(fn: () => T) => Promise<T>): void => {
  if (isSyncDisabled()) {
    enqueue = enqueueFn
    setSyncStatus('offline')
    return
  }
  metaFilePath = path.join(userDataPath, 'sync-meta.json')
  enqueue = enqueueFn
  pushChain = Promise.resolve()
  syncLock = false
  dirtyIds.clear()
  lastAuthCheckAt = 0
  loadMeta()

  wasOnline = net.isOnline()
  if (!wasOnline) setSyncStatus('offline')

  app.on('browser-window-focus', () => {
    pull()
  })

  setInterval(pollConnectivity, CONNECTIVITY_POLL_MS)
}
