import fs from 'node:fs'
import path from 'node:path'
import type { Note, ProjectNote, Task, TaskCategory } from '@shared/types'
import { ALL_CATEGORIES } from '@shared/categories'
import { calculateEffectiveCategory, getTasksNeedingUpdate } from '@shared/category-calculator'
import { app } from '../electron'

// --- Constants ---

const MAX_PAYLOAD_SIZE = 100_000

// --- In-Memory Cache ---

let tasksCache: Task[] = []
let notesCache: Note[] = []

// --- Local File Persistence ---

let tasksPath = ''
let notesPath = ''

/** Atomically write tasks cache to disk (write tmp + rename). */
const persistTasks = (): void => {
  const tmp = tasksPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(tasksCache, null, 2))
  fs.renameSync(tmp, tasksPath)
}

/** Atomically write notes cache to disk (write tmp + rename). */
const persistNotes = (): void => {
  const tmp = notesPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(notesCache, null, 2))
  fs.renameSync(tmp, notesPath)
}

// --- Database Initialization ---

/**
 * Initialize the database: load tasks and notes from local JSON files.
 */
export const initDatabase = async (): Promise<void> => {
  const dataDir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  tasksPath = path.join(dataDir, 'tasks.json')
  notesPath = path.join(dataDir, 'notes.json')

  try {
    if (fs.existsSync(tasksPath)) {
      tasksCache = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'))
    }
  } catch (err) {
    console.error('Failed to load tasks:', err)
    tasksCache = []
  }

  try {
    if (fs.existsSync(notesPath)) {
      notesCache = JSON.parse(fs.readFileSync(notesPath, 'utf-8'))
    }
  } catch (err) {
    console.error('Failed to load notes:', err)
    notesCache = []
  }

  console.log(`Database initialized: ${tasksCache.length} tasks, ${notesCache.length} notes`)
}

// --- Validation ---

const validate = (rules: [boolean, string][]): string | null => rules.find(([fail]) => fail)?.[1] ?? null

const validateTask = (p: { title?: string; description?: string | null; category?: TaskCategory }): string | null =>
  validate([
    [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
    [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
    [typeof p.title === 'string' && p.title.length > 500, 'Title too long'],
    [p.description != null && typeof p.description !== 'string', 'Description must be a string'],
    [typeof p.description === 'string' && p.description.length > 5000, 'Description too long'],
    [p.category !== undefined && !ALL_CATEGORIES.includes(p.category), 'Invalid category'],
    [JSON.stringify(p).length > MAX_PAYLOAD_SIZE, 'Payload too large'],
  ])

const validateProjectNote = (p: { content: string }): string | null =>
  validate([
    [typeof p.content !== 'string', 'Content must be a string'],
    [!p.content.trim(), 'Content cannot be empty'],
    [p.content.length > 10000, 'Content too long'],
  ])

const validateNotetankNote = (p: { title?: string; content?: string }): string | null =>
  validate([
    [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
    [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
    [typeof p.title === 'string' && p.title.length > 200, 'Title too long'],
    [p.content !== undefined && typeof p.content !== 'string', 'Content must be a string'],
    [typeof p.content === 'string' && p.content.length > 50000, 'Content too long'],
  ])

// --- Tasks ---

export const getTasks = async (): Promise<Task[]> => {
  return tasksCache
}

export const addTask = async (p: {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone?: boolean
  scheduledDate?: number
  scheduledTime?: string
}): Promise<Task | { error: string }> => {
  const err = validateTask(p)
  if (err) return { error: err }

  const now = Date.now()

  // Calculate effective category for scheduled tasks (project tasks excluded)
  let effectiveCategory = p.category
  let baseCategory: TaskCategory | undefined = undefined

  if (p.scheduledDate && p.category !== 'project') {
    baseCategory = p.category
    effectiveCategory = calculateEffectiveCategory(p.scheduledDate, p.scheduledTime, now)
  }

  // New tasks get sortOrder 0 (top of list), existing tasks shift down
  const task: Task = {
    id: p.id,
    title: p.title.trim(),
    description: p.description?.trim(),
    category: effectiveCategory,
    baseCategory,
    scheduledDate: p.scheduledDate,
    scheduledTime: p.scheduledTime,
    isDone: p.isDone ?? false,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    sortOrder: 0,
  }

  // Update cache immediately for responsiveness
  tasksCache = [
    task,
    ...tasksCache
      .filter((t) => t.id !== task.id)
      .map((t) => (t.category === task.category ? { ...t, sortOrder: (t.sortOrder ?? 0) + 1 } : t)),
  ]

  persistTasks()

  return task
}

export const updateTask = async (p: {
  id: string
  title?: string
  description?: string | null
  isDone?: boolean
  category?: TaskCategory
  scheduledDate?: number | null
  scheduledTime?: string | null
  userPromoted?: boolean
}): Promise<Task | null | { error: string }> => {
  const err = validateTask(p)
  if (err) return { error: err }

  const existing = tasksCache.find((t) => t.id === p.id)
  if (!existing) return null

  const now = Date.now()

  // Handle scheduling field updates
  const newScheduledDate = p.scheduledDate === null ? undefined : (p.scheduledDate ?? existing.scheduledDate)
  const newScheduledTime = p.scheduledTime === null ? undefined : (p.scheduledTime ?? existing.scheduledTime)

  // Determine base category
  let newBaseCategory = existing.baseCategory
  if (p.category !== undefined) {
    // User is explicitly changing the category
    if (newScheduledDate && p.category !== 'project') {
      newBaseCategory = p.category
    } else if (!newScheduledDate) {
      newBaseCategory = undefined
    }
  } else if (p.scheduledDate !== undefined) {
    // Scheduling is being added/removed
    if (newScheduledDate && existing.category !== 'project') {
      newBaseCategory = existing.baseCategory ?? existing.category
    } else if (!newScheduledDate) {
      newBaseCategory = undefined
    }
  }

  // Calculate effective category
  let effectiveCategory = p.category ?? existing.category
  if (newScheduledDate && effectiveCategory !== 'project') {
    effectiveCategory = calculateEffectiveCategory(newScheduledDate, newScheduledTime, now)
  } else if (!newScheduledDate && existing.baseCategory) {
    // Schedule removed - revert to base category
    effectiveCategory = existing.baseCategory
  }

  const categoryChanged = effectiveCategory !== existing.category

  // If user explicitly promoted (via drag-drop), set the flag
  const newUserPromoted = p.userPromoted ?? existing.userPromoted

  const updated: Task = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    description: p.description === null ? undefined : (p.description?.trim() ?? existing.description),
    category: effectiveCategory,
    baseCategory: newBaseCategory,
    scheduledDate: newScheduledDate,
    scheduledTime: newScheduledTime,
    userPromoted: newUserPromoted,
    isDone: p.isDone ?? existing.isDone,
    updatedAt: now,
    sortOrder: categoryChanged ? 0 : (existing.sortOrder ?? 0), // Move to top if category changed
  }

  // Update cache
  if (categoryChanged) {
    tasksCache = tasksCache.map((t) => {
      if (t.id === p.id) return updated
      if (t.category === effectiveCategory) return { ...t, sortOrder: (t.sortOrder ?? 0) + 1 }
      return t
    })
  } else {
    tasksCache = tasksCache.map((t) => (t.id === p.id ? updated : t))
  }

  persistTasks()

  return updated
}

export const reorderTask = async (taskId: string, targetIndex: number): Promise<boolean> => {
  const task = tasksCache.find((t) => t.id === taskId)
  if (!task) return false

  // Get tasks in the same category, sorted by sortOrder
  const categoryTasks = tasksCache
    .filter((t) => t.category === task.category && !t.isDeleted)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const currentIndex = categoryTasks.findIndex((t) => t.id === taskId)
  if (currentIndex === -1 || currentIndex === targetIndex) return false

  // Remove task from current position and insert at target
  categoryTasks.splice(currentIndex, 1)
  categoryTasks.splice(targetIndex, 0, task)

  // Update sortOrder for all tasks in category
  const now = Date.now()

  // Update cache
  tasksCache = tasksCache.map((t) => {
    if (t.category !== task.category) return t
    const idx = categoryTasks.findIndex((ct) => ct.id === t.id)
    if (idx === -1) return t
    return { ...t, sortOrder: idx, updatedAt: now }
  })

  persistTasks()

  return true
}

export const deleteTask = async (id: string): Promise<void> => {
  tasksCache = tasksCache.filter((t) => t.id !== id)
  persistTasks()
}

// --- Project Notes ---

const findTaskByProjectNote = (noteId: string): { task: Task; note: ProjectNote } | null => {
  for (const task of tasksCache) {
    const note = task.projectNotes?.find((n) => n.id === noteId)
    if (note) return { task, note }
  }
  return null
}

export const addProjectNote = async (p: {
  id: string
  taskId: string
  content: string
}): Promise<ProjectNote | { error: string }> => {
  const err = validateProjectNote(p)
  if (err) return { error: err }

  const task = tasksCache.find((t) => t.id === p.taskId)
  if (!task) return { error: 'Task not found' }

  const now = Date.now()
  const note: ProjectNote = {
    id: p.id,
    taskId: p.taskId,
    content: p.content.trim(),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  // Update task with new note
  const updatedTask: Task = {
    ...task,
    projectNotes: [...(task.projectNotes || []), note],
    updatedAt: now,
  }

  // Update cache
  tasksCache = tasksCache.map((t) => (t.id === p.taskId ? updatedTask : t))

  persistTasks()

  return note
}

export const updateProjectNote = async (p: {
  id: string
  content: string
}): Promise<ProjectNote | null | { error: string }> => {
  const err = validateProjectNote(p)
  if (err) return { error: err }

  const found = findTaskByProjectNote(p.id)
  if (!found) return null

  const now = Date.now()
  const updated: ProjectNote = {
    ...found.note,
    content: p.content.trim(),
    updatedAt: now,
  }

  // Update task
  const updatedTask: Task = {
    ...found.task,
    projectNotes: (found.task.projectNotes ?? []).map((n) => (n.id === p.id ? updated : n)),
    updatedAt: now,
  }

  // Update cache
  tasksCache = tasksCache.map((t) => (t.id === found.task.id ? updatedTask : t))

  persistTasks()

  return updated
}

export const deleteProjectNote = async (id: string): Promise<void> => {
  const found = findTaskByProjectNote(id)
  if (!found) return

  const now = Date.now()
  const updatedTask: Task = {
    ...found.task,
    projectNotes: found.task.projectNotes?.filter((n) => n.id !== id),
    updatedAt: now,
  }

  // Update cache
  tasksCache = tasksCache.map((t) => (t.id === found.task.id ? updatedTask : t))

  persistTasks()
}

// --- Notetank Notes ---

export const getNotes = async (): Promise<Note[]> => {
  return notesCache
}

export const addNote = async (p: { id: string; title: string; content: string }): Promise<Note | { error: string }> => {
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

  // Update cache
  notesCache = [note, ...notesCache.filter((n) => n.id !== note.id)]

  persistNotes()

  return note
}

export const updateNote = async (p: {
  id: string
  title?: string
  content?: string
}): Promise<Note | null | { error: string }> => {
  const err = validateNotetankNote(p)
  if (err) return { error: err }

  const existing = notesCache.find((n) => n.id === p.id)
  if (!existing) return null

  const updated: Note = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    content: p.content !== undefined ? p.content.trim() : existing.content,
    updatedAt: Date.now(),
  }

  // Update cache
  notesCache = notesCache.map((n) => (n.id === p.id ? updated : n))

  persistNotes()

  return updated
}

export const deleteNote = async (id: string): Promise<void> => {
  notesCache = notesCache.filter((n) => n.id !== id)
  persistNotes()
}

// --- Scheduled Task Category Recalculation ---

/**
 * Recalculate categories for all scheduled tasks based on current time.
 * Returns the number of tasks that were updated.
 */
export const recalculateScheduledCategories = async (): Promise<number> => {
  const now = Date.now()

  // Find tasks that need category updates
  const tasksNeedingUpdate = getTasksNeedingUpdate(tasksCache, now)

  if (tasksNeedingUpdate.length === 0) return 0

  const updatedIds = new Set<string>()
  const updatedTasks: Task[] = []

  for (const task of tasksNeedingUpdate) {
    const newCategory = calculateEffectiveCategory(task.scheduledDate!, task.scheduledTime, now)

    // Check if category actually changed (handles edge cases)
    if (newCategory === task.category) continue

    updatedIds.add(task.id)

    const updated: Task = {
      ...task,
      category: newCategory,
      updatedAt: now,
      sortOrder: 0, // Move to top of new category
    }
    updatedTasks.push(updated)
  }

  if (updatedIds.size === 0) return 0

  // Update cache
  tasksCache = tasksCache.map((task) => {
    const updated = updatedTasks.find((t) => t.id === task.id)
    if (updated) return updated
    return task
  })

  // Reassign sortOrder within categories
  const byCategory = new Map<TaskCategory, Task[]>()
  for (const task of tasksCache) {
    if (!byCategory.has(task.category)) byCategory.set(task.category, [])
    byCategory.get(task.category)!.push(task)
  }

  tasksCache = tasksCache.map((task) => {
    const categoryTasks = byCategory.get(task.category) ?? []
    const sorted = [...categoryTasks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const newSortOrder = sorted.findIndex((t) => t.id === task.id)
    return { ...task, sortOrder: newSortOrder >= 0 ? newSortOrder : task.sortOrder }
  })

  persistTasks()

  return updatedIds.size
}
