import type { Note, ProjectNote, Task, TaskCategory } from './types'
import { ALL_CATEGORIES, normalizeCategory } from './categories'
import { ok, fail, type Result } from './result'
import { generateNKeysBetween } from 'fractional-indexing'

// --- Limits ---

export const LIMITS = {
  TASK_TITLE_MAX: 500,
  TASK_DESCRIPTION_MAX: 5000,
  NOTE_TITLE_MAX: 200,
  NOTE_CONTENT_MAX: 50000,
  PROJECT_NOTE_CONTENT_MAX: 10000,
} as const

// --- Core combinator ---

/** Returns a Result carrying the first failing rule's error, or ok(null) if all pass. */
const validate = (rules: [boolean, string][]): Result<null> => {
  const failed = rules.find(([cond]) => cond)
  return failed ? fail(failed[1]) : ok(null)
}

// --- Format validators ---

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export const isValidTimeFormat = (s: string): boolean => TIME_REGEX.test(s)

// --- Field-level validators ---

export const validateId = (id: unknown): string | null => {
  if (typeof id !== 'string' || !id.trim()) return 'ID must be a non-empty string'
  return null
}

export const validateTaskFields = (p: {
  title?: string
  description?: string | null
  category?: TaskCategory
  scheduledTime?: string | null
}): Result<null> =>
  validate([
    [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
    [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
    [typeof p.title === 'string' && p.title.length > LIMITS.TASK_TITLE_MAX, 'Title too long'],
    [p.description != null && typeof p.description !== 'string', 'Description must be a string'],
    [typeof p.description === 'string' && p.description.length > LIMITS.TASK_DESCRIPTION_MAX, 'Description too long'],
    [p.category !== undefined && !ALL_CATEGORIES.includes(p.category), 'Invalid category'],
    [
      p.scheduledTime != null && typeof p.scheduledTime === 'string' && !isValidTimeFormat(p.scheduledTime),
      'Invalid time format (expected HH:MM)',
    ],
  ])

export const validateProjectNoteFields = (p: { content: string }): Result<null> =>
  validate([
    [typeof p.content !== 'string', 'Content must be a string'],
    [!p.content.trim(), 'Content cannot be empty'],
    [p.content.length > LIMITS.PROJECT_NOTE_CONTENT_MAX, 'Content too long'],
  ])

export const validateNoteFields = (p: { title?: string; content?: string }): Result<null> =>
  validate([
    [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
    [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
    [typeof p.title === 'string' && p.title.length > LIMITS.NOTE_TITLE_MAX, 'Title too long'],
    [p.content !== undefined && typeof p.content !== 'string', 'Content must be a string'],
    [typeof p.content === 'string' && p.content.length > LIMITS.NOTE_CONTENT_MAX, 'Content too long'],
  ])

// --- Schema sanitization (for data loaded from JSON files) ---

const sanitizeProjectNote = (raw: unknown): ProjectNote | null => {
  if (!raw || typeof raw !== 'object') return null
  const n = raw as Record<string, unknown>
  if (typeof n.id !== 'string' || !n.id) return null
  if (typeof n.taskId !== 'string' || !n.taskId) return null
  if (typeof n.content !== 'string') return null

  return {
    id: n.id,
    taskId: n.taskId,
    content: n.content,
    createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now(),
    updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : Date.now(),
    deletedAt: typeof n.deletedAt === 'number' ? n.deletedAt : undefined,
  }
}

export const sanitizeTask = (raw: unknown): Task | null => {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  if (typeof t.id !== 'string' || !t.id) return null
  if (typeof t.title !== 'string' || !t.title) return null

  return {
    id: t.id,
    title: t.title,
    description: typeof t.description === 'string' ? t.description : undefined,
    category: normalizeCategory(t.category),
    isDone: typeof t.isDone === 'boolean' ? t.isDone : false,
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
    updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
    sortOrder:
      typeof t.sortOrder === 'string' ? t.sortOrder : typeof t.sortOrder === 'number' ? `\x00${t.sortOrder}` : 'a0',
    projectNotes: Array.isArray(t.projectNotes)
      ? (t.projectNotes as unknown[]).map(sanitizeProjectNote).filter((n): n is ProjectNote => n !== null)
      : undefined,
    scheduledDate: typeof t.scheduledDate === 'number' ? t.scheduledDate : undefined,
    scheduledTime: typeof t.scheduledTime === 'string' ? t.scheduledTime : undefined,
    deletedAt: typeof t.deletedAt === 'number' ? t.deletedAt : undefined,
  }
}

export const sanitizeNote = (raw: unknown): Note | null => {
  if (!raw || typeof raw !== 'object') return null
  const n = raw as Record<string, unknown>
  if (typeof n.id !== 'string' || !n.id) return null
  if (typeof n.title !== 'string' || !n.title) return null

  return {
    id: n.id,
    title: n.title,
    content: typeof n.content === 'string' ? n.content : '',
    createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now(),
    updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : Date.now(),
    deletedAt: typeof n.deletedAt === 'number' ? n.deletedAt : undefined,
  }
}

/** Parse and sanitize an array of tasks from raw JSON data. Drops malformed entries. */
export const sanitizeTasks = (raw: unknown): Task[] => {
  if (!Array.isArray(raw)) return []
  const tasks: Task[] = []
  for (const entry of raw) {
    const task = sanitizeTask(entry)
    if (task) tasks.push(task)
    else console.warn('Dropped malformed task entry during load:', entry)
  }

  // Migrate legacy numeric sortOrder to fractional string keys.
  // sanitizeTask tags numeric values with a '\x00' prefix sentinel.
  const needsMigration = tasks.some((t) => t.sortOrder.startsWith('\x00'))
  if (needsMigration) {
    const byCategory = new Map<TaskCategory, Task[]>()
    for (const t of tasks) {
      let list = byCategory.get(t.category)
      if (!list) {
        list = []
        byCategory.set(t.category, list)
      }
      list.push(t)
    }
    for (const categoryTasks of byCategory.values()) {
      categoryTasks.sort((a, b) => {
        const aNum = a.sortOrder.startsWith('\x00') ? Number(a.sortOrder.slice(1)) : Infinity
        const bNum = b.sortOrder.startsWith('\x00') ? Number(b.sortOrder.slice(1)) : Infinity
        return aNum - bNum
      })
      const keys = generateNKeysBetween(null, null, categoryTasks.length)
      categoryTasks.forEach((t, i) => {
        t.sortOrder = keys[i]
      })
    }
  }

  return tasks
}

/** Parse and sanitize an array of notes from raw JSON data. Drops malformed entries. */
export const sanitizeNotes = (raw: unknown): Note[] => {
  if (!Array.isArray(raw)) return []
  const notes: Note[] = []
  for (const entry of raw) {
    const note = sanitizeNote(entry)
    if (note) notes.push(note)
    else console.warn('Dropped malformed note entry during load:', entry)
  }
  return notes
}
