// Postgres row types (matching 001_initial_schema.sql) and
// bidirectional mappers between app types and Supabase rows.

import type { Task, ProjectNote, Note } from './types'
import { normalizeCategory } from './categories'

// --- Row types (what the Supabase JS client returns) ---

type TaskRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  category: string
  is_done: boolean
  sort_order: string
  scheduled_date: string | null // 'YYYY-MM-DD'
  scheduled_time: string | null // 'HH:MM'
  created_at: string // ISO 8601
  updated_at: string // ISO 8601
  deleted_at: string | null // ISO 8601
}

type ProjectNoteRow = {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type NoteRow = {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// --- Timestamp helpers ---

const toIso = (unixMs: number): string => new Date(unixMs).toISOString()

const fromIso = (iso: string): number => new Date(iso).getTime()

// scheduled_date uses local (KST) midnight — matches how the app creates dates
// via date.setHours(0, 0, 0, 0) in QuickAdd.tsx and CalendarTaskModal.tsx
const toDateString = (unixMs: number): string => {
  const d = new Date(unixMs)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const fromDateString = (dateStr: string): number => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getTime() // local (KST) midnight
}

// --- Task mappers ---

export const toTaskRow = (task: Task, userId: string): TaskRow => ({
  id: task.id,
  user_id: userId,
  title: task.title,
  description: task.description ?? null,
  category: task.category,
  is_done: task.isDone,
  sort_order: task.sortOrder,
  scheduled_date: task.scheduledDate != null ? toDateString(task.scheduledDate) : null,
  scheduled_time: task.scheduledTime ?? null,
  created_at: toIso(task.createdAt),
  updated_at: toIso(task.updatedAt),
  deleted_at: task.deletedAt != null ? toIso(task.deletedAt) : null,
})

export const fromTaskRow = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  description: row.description ?? undefined,
  category: normalizeCategory(row.category),
  isDone: row.is_done,
  sortOrder: row.sort_order,
  scheduledDate: row.scheduled_date != null ? fromDateString(row.scheduled_date) : undefined,
  scheduledTime: row.scheduled_time ?? undefined,
  createdAt: fromIso(row.created_at),
  updatedAt: fromIso(row.updated_at),
  deletedAt: row.deleted_at != null ? fromIso(row.deleted_at) : undefined,
  // projectNotes are fetched separately from the project_notes table
})

// --- ProjectNote mappers ---

export const toProjectNoteRow = (note: ProjectNote, userId: string): ProjectNoteRow => ({
  id: note.id,
  task_id: note.taskId,
  user_id: userId,
  content: note.content,
  created_at: toIso(note.createdAt),
  updated_at: toIso(note.updatedAt),
  deleted_at: note.deletedAt != null ? toIso(note.deletedAt) : null,
})

export const fromProjectNoteRow = (row: ProjectNoteRow): ProjectNote => ({
  id: row.id,
  taskId: row.task_id,
  content: row.content,
  createdAt: fromIso(row.created_at),
  updatedAt: fromIso(row.updated_at),
  deletedAt: row.deleted_at != null ? fromIso(row.deleted_at) : undefined,
})

// --- Note mappers ---

export const toNoteRow = (note: Note, userId: string): NoteRow => ({
  id: note.id,
  user_id: userId,
  title: note.title,
  content: note.content,
  created_at: toIso(note.createdAt),
  updated_at: toIso(note.updatedAt),
  deleted_at: note.deletedAt != null ? toIso(note.deletedAt) : null,
})

export const fromNoteRow = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  content: row.content,
  createdAt: fromIso(row.created_at),
  updatedAt: fromIso(row.updated_at),
  deletedAt: row.deleted_at != null ? fromIso(row.deleted_at) : undefined,
})
