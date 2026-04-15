import path from 'node:path'
import type { ProjectNote, Task, TaskCategory } from '@shared/types'
import type { Result } from '@shared/result'
import { ok, fail } from '@shared/result'
import { validateId, validateTaskFields, validateProjectNoteFields, sanitizeTasks } from '@shared/validation'
import { readJsonFile, writeJsonFile } from './store'

// --- In-Memory Cache ---

let cache: Task[] = []
let filePath = ''

// --- Persistence ---

const persist = (): void => {
  writeJsonFile(filePath, cache)
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

// --- Tasks ---

export const getTasks = (): Task[] => cache

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

  const fieldErr = validateTaskFields(p)
  if (fieldErr) return fail(fieldErr)

  const now = Date.now()

  // New tasks get sortOrder 0 (top of list), existing tasks shift down
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
    sortOrder: 0,
  }

  cache = [task, ...cache.map((t) => (t.category === task.category ? { ...t, sortOrder: (t.sortOrder ?? 0) + 1 } : t))]

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
  const fieldErr = validateTaskFields(p)
  if (fieldErr) return fail(fieldErr)

  const existing = cache.find((t) => t.id === p.id)
  if (!existing) return ok(null)

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
    sortOrder: categoryChanged ? 0 : (existing.sortOrder ?? 0),
  }

  if (categoryChanged) {
    cache = cache.map((t) => {
      if (t.id === p.id) return updated
      if (t.category === newCategory) return { ...t, sortOrder: (t.sortOrder ?? 0) + 1 }
      return t
    })
  } else {
    cache = cache.map((t) => (t.id === p.id ? updated : t))
  }

  persist()
  return ok(updated)
}

export const reorderTask = (taskId: string, targetIndex: number): boolean => {
  const task = cache.find((t) => t.id === taskId)
  if (!task) return false

  const categoryTasks = cache
    .filter((t) => t.category === task.category)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const currentIndex = categoryTasks.findIndex((t) => t.id === taskId)
  if (currentIndex === -1 || currentIndex === targetIndex) return false

  categoryTasks.splice(currentIndex, 1)
  categoryTasks.splice(targetIndex, 0, task)

  const now = Date.now()
  cache = cache.map((t) => {
    if (t.category !== task.category) return t
    const idx = categoryTasks.findIndex((ct) => ct.id === t.id)
    if (idx === -1) return t
    return { ...t, sortOrder: idx, updatedAt: now }
  })

  persist()
  return true
}

export const deleteTask = (id: string): void => {
  cache = cache.filter((t) => t.id !== id)
  persist()
}

// --- Project Notes ---

export const addProjectNote = (p: { id: string; taskId: string; content: string }): Result<ProjectNote> => {
  const idErr = validateId(p.id)
  if (idErr) return fail(idErr)

  const fieldErr = validateProjectNoteFields(p)
  if (fieldErr) return fail(fieldErr)

  const task = cache.find((t) => t.id === p.taskId)
  if (!task) return fail('Task not found')

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
  const fieldErr = validateProjectNoteFields(p)
  if (fieldErr) return fail(fieldErr)

  const found = findTaskByProjectNote(p.id)
  if (!found) return ok(null)

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

export const deleteProjectNote = (id: string): void => {
  const found = findTaskByProjectNote(id)
  if (!found) return

  const now = Date.now()
  const updatedTask: Task = {
    ...found.task,
    projectNotes: found.task.projectNotes?.filter((n) => n.id !== id),
    updatedAt: now,
  }

  cache = cache.map((t) => (t.id === found.task.id ? updatedTask : t))
  persist()
}
