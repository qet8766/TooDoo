import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Note } from '@shared/types'
import { validateNoteFields, sanitizeNotes } from '@shared/validation'
import { readJson, writeJson } from '../data/persistence'
import { createQueue } from '../data/queue'
import { pushEntity } from '../data/sync'

const NOTES_KEY = '@toodoo/notes'

const queue = createQueue()

type NoteState = {
  notes: Note[]
}

type NoteActions = {
  init: () => Promise<void>
  addNote: (p: { title: string; content: string }) => Promise<Note | null>
  updateNote: (p: { id: string; title?: string; content?: string }) => Promise<Note | null>
  deleteNote: (id: string) => Promise<void>
  // Sync helpers
  getAllNotesRaw: () => Note[]
  replaceCache: (notes: Note[]) => void
}

export const useNoteStore = create<NoteState & NoteActions>((set, get) => {
  const persist = () => {
    writeJson(NOTES_KEY, get().notes)
  }

  return {
    notes: [],

    init: async () => {
      const raw = await readJson(NOTES_KEY)
      const notes = sanitizeNotes(raw)
      set({ notes })
    },

    addNote: (p) =>
      queue.enqueue(() => {
        const fieldRes = validateNoteFields(p)
        if (!fieldRes.success) {
          console.warn('addNote validation:', fieldRes.error)
          return null
        }

        const { notes } = get()
        const now = Date.now()
        const note: Note = {
          id: uuid(),
          title: p.title.trim(),
          content: p.content.trim(),
          createdAt: now,
          updatedAt: now,
        }

        set({ notes: [note, ...notes] })
        persist()
        pushEntity('note', note)
        return note
      }),

    updateNote: (p) =>
      queue.enqueue(() => {
        const fieldRes = validateNoteFields(p)
        if (!fieldRes.success) {
          console.warn('updateNote validation:', fieldRes.error)
          return null
        }

        const { notes } = get()
        const existing = notes.find((n) => n.id === p.id)
        if (!existing || existing.deletedAt) return null

        const updated: Note = {
          ...existing,
          title: p.title !== undefined ? p.title.trim() : existing.title,
          content: p.content !== undefined ? p.content.trim() : existing.content,
          updatedAt: Date.now(),
        }

        set({ notes: notes.map((n) => (n.id === p.id ? updated : n)) })
        persist()
        pushEntity('note', updated)
        return updated
      }),

    deleteNote: (id) =>
      queue.enqueue(() => {
        const { notes } = get()
        const now = Date.now()
        const updated = notes.map((n) => (n.id === id ? { ...n, deletedAt: now, updatedAt: now } : n))
        set({ notes: updated })
        persist()

        const deletedNote = updated.find((n) => n.id === id)
        if (deletedNote) pushEntity('note', deletedNote)
      }),

    // Sync helpers
    getAllNotesRaw: () => [...get().notes],
    replaceCache: (notes) => {
      set({ notes })
      persist()
    },
  }
})
