import path from 'node:path'
import type { Note } from '@shared/types'
import type { Result } from '@shared/result'
import { ok, fail } from '@shared/result'
import { validateId, validateNoteFields, sanitizeNotes } from '@shared/validation'
import { readJsonFile, writeJsonFile } from './store'

// --- In-Memory Cache ---

let cache: Note[] = []
let filePath = ''

// --- Persistence ---

const persist = (): void => {
  writeJsonFile(filePath, cache)
}

// --- Initialization ---

export const init = (dataDir: string): void => {
  filePath = path.join(dataDir, 'notes.json')
  const raw = readJsonFile(filePath)
  if (raw && typeof raw === 'object' && 'type' in raw && (raw as { type: string }).type === 'io_error') {
    console.error('Failed to load notes:', raw)
    cache = []
  } else {
    cache = sanitizeNotes(raw)
  }
  console.log(`Notes loaded: ${cache.length}`)
}

// --- Notes ---

export const getNotes = (): Note[] => cache

export const addNote = (p: { id: string; title: string; content: string }): Result<Note> => {
  const idErr = validateId(p.id)
  if (idErr) return fail(idErr)

  if (cache.some((n) => n.id === p.id)) return fail('Note with this ID already exists')

  const fieldErr = validateNoteFields(p)
  if (fieldErr) return fail(fieldErr)

  const now = Date.now()
  const note: Note = {
    id: p.id,
    title: p.title.trim(),
    content: p.content.trim(),
    createdAt: now,
    updatedAt: now,
  }

  cache = [note, ...cache]
  persist()
  return ok(note)
}

export const updateNote = (p: { id: string; title?: string; content?: string }): Result<Note | null> => {
  const fieldErr = validateNoteFields(p)
  if (fieldErr) return fail(fieldErr)

  const existing = cache.find((n) => n.id === p.id)
  if (!existing) return ok(null)

  const updated: Note = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    content: p.content !== undefined ? p.content.trim() : existing.content,
    updatedAt: Date.now(),
  }

  cache = cache.map((n) => (n.id === p.id ? updated : n))
  persist()
  return ok(updated)
}

export const deleteNote = (id: string): void => {
  cache = cache.filter((n) => n.id !== id)
  persist()
}
