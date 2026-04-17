import path from 'node:path'
import type { ProjectNote, Task, TaskCategory } from '@shared/types'
import type { Result } from '@shared/result'
import { ok, fail } from '@shared/result'
import { validateId, validateTaskFields, validateProjectNoteFields, sanitizeTasks } from '@shared/validation'
import { readJsonFile, writeJsonFile, type StoreError } from './store'
import { generateKeyBetween } from 'fractional-indexing'

// --- In-Memory Cache ---

let cache: Task[] = []
let filePath = ''

// --- Persistence ---

const persist = (): StoreError | undefined => {
  return writeJsonFile(filePath, cache)
}

// --- Initialization ---

export const init = (dataDir: string): void => {
  filePath = path.join(dataDir, 'tasks.json')
  const raw = readJsonFile(filePath)
  if (raw && typeof raw === 'object' && 'type' in raw && (raw as { type: string }).type === 'io_error') {
    console.error('Failed to load tasks:', raw)
    cache = []
  } else {
    cache = sanitizeTasks(raw)
  }
  console.log(`Tasks loaded: ${cache.length}`)
}

// --- Helpers ---

const findTaskByProjectNote = (noteId: string): { task: Task; note: ProjectNote } | null => {
  for (const task of cache) {
    const note = task.projectNotes?.find((n) => n.id === noteId)
    if (note) return { task, note }
  }
  return null
}

const activeCategoryTasks = (category: TaskCategory): Task[] =>
  cache
    .filter((t) => t.category === category && !t.deletedAt)
    .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0))

const firstSortKey = (category: TaskCategory): string | null => {
  const tasks = activeCategoryTasks(category)
  return tasks.length > 0 ? tasks[0].sortOrder : null
}

// --- Tasks ---

export const getTasks = (): Task[] =>
  cache.filter((t) => !t.deletedAt).map((t) => ({ ...t, projectNotes: t.projectNotes?.filter((n) => !n.deletedAt) }))

export const addTask = (p: {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone?: boolean
  scheduledDate?: number
  scheduledTime?: string
}): Result<Task> => {
  const idErr = validateId(p.id)
  if (idErr) return fail(idErr)

  if (cache.some((t) => t.id === p.id)) return fail('Task with this ID already exists')

  const fieldRes = validateTaskFields(p)
  if (!fieldRes.success) return fieldRes

  const now = Date.now()
  const sortKey = generateKeyBetween(null, firstSortKey(p.category))

  const task: Task = {
    id: p.id,
    title: p.title.trim(),
    description: p.description?.trim(),
    category: p.category,
    scheduledDate: p.scheduledDate,
    scheduledTime: p.scheduledTime,
    isDone: p.isDone ?? false,
    createdAt: now,
    updatedAt: now,
    sortOrder: sortKey,
  }

  cache = [task, ...cache]

  persist()
  return ok(task)
}

export const updateTask = (p: {
  id: string
  title?: string
  description?: string | null
  isDone?: boolean
  category?: TaskCategory
  scheduledDate?: number | null
  scheduledTime?: string | null
}): Result<Task | null> => {
  const fieldRes = validateTaskFields(p)
  if (!fieldRes.success) return fieldRes

  const existing = cache.find((t) => t.id === p.id)
  if (!existing || existing.deletedAt) return ok(null)

  const now = Date.now()

  const newScheduledDate = p.scheduledDate === null ? undefined : (p.scheduledDate ?? existing.scheduledDate)
  const newScheduledTime = p.scheduledTime === null ? undefined : (p.scheduledTime ?? existing.scheduledTime)
  const newCategory = p.category ?? existing.category
  const categoryChanged = newCategory !== existing.category

  const updated: Task = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    description: p.description === null ? undefined : (p.description?.trim() ?? existing.description),
    category: newCategory,
    scheduledDate: newScheduledDate,
    scheduledTime: newScheduledTime,
    isDone: p.isDone ?? existing.isDone,
    updatedAt: now,
    sortOrder: categoryChanged ? generateKeyBetween(null, firstSortKey(newCategory)) : existing.sortOrder,
  }

  cache = cache.map((t) => (t.id === p.id ? updated : t))

  persist()
  return ok(updated)
}

export const reorderTask = (taskId: string, targetIndex: number): Result<{ id: string }> => {
  const task = cache.find((t) => t.id === taskId && !t.deletedAt)
  if (!task) return fail('Task not found')

  const sorted = activeCategoryTasks(task.category)
  const currentIndex = sorted.findIndex((t) => t.id === taskId)
  if (currentIndex === -1) return fail('Task not found in its category')
  // Same position — no-op success. No mutation, no push.
  if (currentIndex === targetIndex) return ok({ id: taskId })

  // Remove current task to compute neighbors at target position
  const withoutCurrent = sorted.filter((t) => t.id !== taskId)
  const before = targetIndex > 0 ? withoutCurrent[targetIndex - 1].sortOrder : null
  const after = targetIndex < withoutCurrent.length ? withoutCurrent[targetIndex].sortOrder : null
  const newKey = generateKeyBetween(before, after)

  const now = Date.now()
  cache = cache.map((t) => (t.id === taskId ? { ...t, sortOrder: newKey, updatedAt: now } : t))

  persist()
  return ok({ id: taskId })
}

export const deleteTask = (id: string): Result<{ id: string }> => {
  const existing = cache.find((t) => t.id === id)
  if (!existing || existing.deletedAt) return fail('Task not found')
  const now = Date.now()
  cache = cache.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t))
  persist()
  return ok({ id })
}

// --- Project Notes ---

export const addProjectNote = (p: { id: string; taskId: string; content: string }): Result<ProjectNote> => {
  const idErr = validateId(p.id)
  if (idErr) return fail(idErr)

  const fieldRes = validateProjectNoteFields(p)
  if (!fieldRes.success) return fieldRes

  const task = cache.find((t) => t.id === p.taskId)
  if (!task || task.deletedAt) return fail('Task not found')

  const now = Date.now()
  const note: ProjectNote = {
    id: p.id,
    taskId: p.taskId,
    content: p.content.trim(),
    createdAt: now,
    updatedAt: now,
  }

  const updatedTask: Task = {
    ...task,
    projectNotes: [...(task.projectNotes || []), note],
    updatedAt: now,
  }

  cache = cache.map((t) => (t.id === p.taskId ? updatedTask : t))
  persist()
  return ok(note)
}

export const updateProjectNote = (p: { id: string; content: string }): Result<ProjectNote | null> => {
  const fieldRes = validateProjectNoteFields(p)
  if (!fieldRes.success) return fieldRes

  const found = findTaskByProjectNote(p.id)
  if (!found || found.note.deletedAt) return ok(null)

  const now = Date.now()
  const updated: ProjectNote = {
    ...found.note,
    content: p.content.trim(),
    updatedAt: now,
  }

  const updatedTask: Task = {
    ...found.task,
    projectNotes: (found.task.projectNotes ?? []).map((n) => (n.id === p.id ? updated : n)),
    updatedAt: now,
  }

  cache = cache.map((t) => (t.id === found.task.id ? updatedTask : t))
  persist()
  return ok(updated)
}

export const deleteProjectNote = (id: string): Result<{ id: string }> => {
  const found = findTaskByProjectNote(id)
  if (!found || found.note.deletedAt) return fail('Project note not found')

  const now = Date.now()
  const updatedTask: Task = {
    ...found.task,
    projectNotes: found.task.projectNotes?.map((n) => (n.id === id ? { ...n, deletedAt: now, updatedAt: now } : n)),
    updatedAt: now,
  }

  cache = cache.map((t) => (t.id === found.task.id ? updatedTask : t))
  persist()
  return ok({ id })
}

// --- Sync Helpers ---

export const getAllTasksRaw = (): Task[] => [...cache]

export const getTaskById = (id: string): Task | undefined => cache.find((t) => t.id === id)

export const replaceCache = (tasks: Task[]): void => {
  const prev = cache
  cache = tasks
  const err = persist()
  if (err) {
    cache = prev
    console.error('replaceCache rollback: disk write failed, reverting in-memory cache')
  }
}
