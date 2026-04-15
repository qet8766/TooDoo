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

const queue = createQueue()

// --- Database Initialization ---

export const initDatabase = async (): Promise<void> => {
  const dataDir = path.join(app.getPath('userData'), 'data')
  ensureDir(dataDir)
  taskOps.init(dataDir)
  noteOps.init(dataDir)
}

// --- Task Operations (queue-wrapped) ---

export const getTasks = (): Promise<Task[]> => queue.enqueue(() => taskOps.getTasks())

export const addTask = (p: TaskCreatePayload): Promise<Result<Task>> => queue.enqueue(() => taskOps.addTask(p))

export const updateTask = (p: TaskUpdatePayload): Promise<Result<Task | null>> =>
  queue.enqueue(() => taskOps.updateTask(p))

export const reorderTask = (taskId: string, targetIndex: number): Promise<boolean> =>
  queue.enqueue(() => taskOps.reorderTask(taskId, targetIndex))

export const deleteTask = (id: string): Promise<void> => queue.enqueue(() => taskOps.deleteTask(id))

// --- Project Note Operations (queue-wrapped) ---

export const addProjectNote = (p: ProjectNoteCreatePayload): Promise<Result<ProjectNote>> =>
  queue.enqueue(() => taskOps.addProjectNote(p))

export const updateProjectNote = (p: ProjectNoteUpdatePayload): Promise<Result<ProjectNote | null>> =>
  queue.enqueue(() => taskOps.updateProjectNote(p))

export const deleteProjectNote = (id: string): Promise<void> => queue.enqueue(() => taskOps.deleteProjectNote(id))

// --- Notetank Note Operations (queue-wrapped) ---

export const getNotes = (): Promise<Note[]> => queue.enqueue(() => noteOps.getNotes())

export const addNote = (p: NoteCreatePayload): Promise<Result<Note>> => queue.enqueue(() => noteOps.addNote(p))

export const updateNote = (p: NoteUpdatePayload): Promise<Result<Note | null>> =>
  queue.enqueue(() => noteOps.updateNote(p))

export const deleteNote = (id: string): Promise<void> => queue.enqueue(() => noteOps.deleteNote(id))

// --- Scheduled Task Category Recalculation ---

export const recalculateScheduledCategories = (): Promise<number> =>
  queue.enqueue(() => taskOps.recalculateScheduledCategories())
