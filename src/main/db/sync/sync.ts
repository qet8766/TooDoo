import path from 'node:path'
import type { Task, ProjectNote, Note } from '@shared/types'
import type { SyncStatusPayload } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import {
  toTaskRow,
  fromTaskRow,
  toProjectNoteRow,
  fromProjectNoteRow,
  toNoteRow,
  fromNoteRow,
} from '@shared/supabase-types'
import { readJsonFile, writeJsonFile } from '../store'
import * as taskOps from '../tasks'
import * as noteOps from '../notes'
import { getClient, getUserId, getAuthStatus } from './supabase'
import { broadcast, broadcastTaskChange, broadcastNotesChange } from '../../broadcast'
import { app, net } from '../../electron'

type SyncStatus = SyncStatusPayload['status']

let syncStatus: SyncStatus = 'offline'
let lastSyncedAt = 0
let metaFilePath = ''
let wasOnline = false
let enqueue: <T>(fn: () => T) => Promise<T>
let pushChain: Promise<void> = Promise.resolve()

const CONNECTIVITY_POLL_MS = 30_000

// --- Status ---

export const getSyncStatus = (): SyncStatus => syncStatus

const setSyncStatus = (status: SyncStatus): void => {
  if (status === syncStatus) return
  syncStatus = status
  broadcast(IPC.SYNC_STATUS_CHANGED, { status } satisfies SyncStatusPayload)
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

// --- Push ---

const doUpsert = async (type: 'task' | 'projectNote' | 'note', entity: Task | ProjectNote | Note): Promise<boolean> => {
  const userId = getUserId()!
  const client = getClient()

  try {
    if (type === 'task') {
      const row = toTaskRow(entity as Task, userId)
      const { error } = await client.from('tasks').upsert(row)
      if (error) {
        console.warn('Push task failed:', error.message)
        return false
      }
    } else if (type === 'projectNote') {
      const row = toProjectNoteRow(entity as ProjectNote, userId)
      const { error } = await client.from('project_notes').upsert(row)
      if (error) {
        console.warn('Push projectNote failed:', error.message)
        return false
      }
    } else {
      const row = toNoteRow(entity as Note, userId)
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

// Serialized fire-and-forget: each push waits for the previous one to complete,
// preventing out-of-order writes to the same entity from network latency.
export const pushEntity = (type: 'task' | 'projectNote' | 'note', entity: Task | ProjectNote | Note): void => {
  if (!net.isOnline() || !getAuthStatus().isSignedIn) return
  pushChain = pushChain.then(async () => {
    await doUpsert(type, entity)
  })
}

// --- Pull ---

export const pull = async (): Promise<void> => {
  if (!net.isOnline() || !getAuthStatus().isSignedIn) return

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
      const localTasks = taskOps.getAllTasksRaw()
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

      taskOps.replaceCache(mergedTasks)

      // --- Merge notes ---
      const localNotes = noteOps.getAllNotesRaw()
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
        if (!seenNoteIds.has(remote.id)) {
          mergedNotes.push(remote)
        }
      }

      noteOps.replaceCache(mergedNotes)
    })

    broadcastTaskChange()
    broadcastNotesChange()
    setSyncStatus('synced')
  } catch (err) {
    console.warn('Pull error:', err)
    setSyncStatus('error')
  }
}

// --- Dirty Push + Pull ---

export const syncDirtyAndPull = async (): Promise<void> => {
  if (!net.isOnline() || !getAuthStatus().isSignedIn) return

  setSyncStatus('syncing')

  let hadFailures = false

  try {
    // Push dirty tasks and their project notes
    const allTasks = taskOps.getAllTasksRaw()
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

    // Push dirty notes
    const allNotes = noteOps.getAllNotesRaw()
    for (const note of allNotes) {
      if (note.updatedAt > lastSyncedAt) {
        if (!(await doUpsert('note', note))) hadFailures = true
      }
    }

    // Pull remote changes
    await pull()

    // Only advance watermark if every push succeeded
    if (!hadFailures) {
      lastSyncedAt = Date.now()
      saveMeta()
    }
  } catch (err) {
    console.warn('Dirty sync error:', err)
    setSyncStatus('error')
  }
}

// --- Project Note Merge ---

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
    if (!seenIds.has(rn.id)) {
      merged.push(rn)
    }
  }

  return merged.length > 0 ? merged : undefined
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
  metaFilePath = path.join(userDataPath, 'sync-meta.json')
  enqueue = enqueueFn
  pushChain = Promise.resolve()
  loadMeta()

  wasOnline = net.isOnline()
  if (!wasOnline) setSyncStatus('offline')

  app.on('browser-window-focus', () => {
    pull()
  })

  setInterval(pollConnectivity, CONNECTIVITY_POLL_MS)
}
