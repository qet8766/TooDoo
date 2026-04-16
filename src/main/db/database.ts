import path from 'node:path'
import type { Note, ProjectNote, Task } from '@shared/types'
import type { Result } from '@shared/result'
import type {
  TaskCreatePayload,
  TaskUpdatePayload,
  ProjectNoteCreatePayload,
  ProjectNoteUpdatePayload,
  NoteCreatePayload,
  NoteUpdatePayload,
} from '@shared/ipc'
import { app } from '../electron'
import { ensureDir } from './store'
import { createQueue } from './queue'
import * as taskOps from './tasks'
import * as noteOps from './notes'
import { pushEntity } from './sync/sync'

const queue = createQueue()

// --- Database Initialization ---

export const initDatabase = async (): Promise<void> => {
  const dataDir = path.join(app.getPath('userData'), 'data')
  ensureDir(dataDir)
  taskOps.init(dataDir)
  noteOps.init(dataDir)
}

// Expose queue for sync engine (pull merge must be serialized with mutations)
export const enqueueSync = <T>(fn: () => T): Promise<T> => queue.enqueue(fn)

// --- Task Operations (queue-wrapped) ---

export const getTasks = (): Promise<Task[]> => queue.enqueue(() => taskOps.getTasks())

export const addTask = (p: TaskCreatePayload): Promise<Result<Task>> =>
  queue.enqueue(() => {
    const result = taskOps.addTask(p)
    if (result.success) pushEntity('task', result.data)
    return result
  })

export const updateTask = (p: TaskUpdatePayload): Promise<Result<Task | null>> =>
  queue.enqueue(() => {
    const result = taskOps.updateTask(p)
    if (result.success && result.data) pushEntity('task', result.data)
    return result
  })

export const reorderTask = (taskId: string, targetIndex: number): Promise<boolean> =>
  queue.enqueue(() => {
    const success = taskOps.reorderTask(taskId, targetIndex)
    if (success) {
      const task = taskOps.getTaskById(taskId)
      if (task) pushEntity('task', task)
    }
    return success
  })

export const deleteTask = (id: string): Promise<void> =>
  queue.enqueue(() => {
    taskOps.deleteTask(id)
    const task = taskOps.getTaskById(id)
    if (task) pushEntity('task', task)
  })

// --- Project Note Operations (queue-wrapped) ---

export const addProjectNote = (p: ProjectNoteCreatePayload): Promise<Result<ProjectNote>> =>
  queue.enqueue(() => {
    const result = taskOps.addProjectNote(p)
    if (result.success) {
      pushEntity('projectNote', result.data)
      const task = taskOps.getTaskById(p.taskId)
      if (task) pushEntity('task', task)
    }
    return result
  })

export const updateProjectNote = (p: ProjectNoteUpdatePayload): Promise<Result<ProjectNote | null>> =>
  queue.enqueue(() => {
    const result = taskOps.updateProjectNote(p)
    if (result.success && result.data) {
      pushEntity('projectNote', result.data)
      const task = taskOps.getTaskById(result.data.taskId)
      if (task) pushEntity('task', task)
    }
    return result
  })

export const deleteProjectNote = (id: string): Promise<void> =>
  queue.enqueue(() => {
    // Get the parent task id before deletion modifies the note
    const found = taskOps.getAllTasksRaw().find((t) => t.projectNotes?.some((n) => n.id === id))
    taskOps.deleteProjectNote(id)
    if (found) {
      // Re-fetch task to get updated state (with deletedAt on the note)
      const task = taskOps.getTaskById(found.id)
      if (task) pushEntity('task', task)
      // Push the now-deleted note from the updated task
      const deletedNote = task?.projectNotes?.find((n) => n.id === id)
      if (deletedNote) pushEntity('projectNote', deletedNote)
    }
  })

// --- Notetank Note Operations (queue-wrapped) ---

export const getNotes = (): Promise<Note[]> => queue.enqueue(() => noteOps.getNotes())

export const addNote = (p: NoteCreatePayload): Promise<Result<Note>> =>
  queue.enqueue(() => {
    const result = noteOps.addNote(p)
    if (result.success) pushEntity('note', result.data)
    return result
  })

export const updateNote = (p: NoteUpdatePayload): Promise<Result<Note | null>> =>
  queue.enqueue(() => {
    const result = noteOps.updateNote(p)
    if (result.success && result.data) pushEntity('note', result.data)
    return result
  })

export const deleteNote = (id: string): Promise<void> =>
  queue.enqueue(() => {
    noteOps.deleteNote(id)
    const note = noteOps.getNoteById(id)
    if (note) pushEntity('note', note)
  })
