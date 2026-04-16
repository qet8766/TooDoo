/**
 * Note Domain Logic Unit Tests
 *
 * Tests for Notetank note CRUD operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock store to avoid real file I/O
vi.mock('../../src/main/db/store', () => ({
  readJsonFile: vi.fn(() => []),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}))

import {
  init,
  getNotes,
  addNote,
  updateNote,
  deleteNote,
  getAllNotesRaw,
  getNoteById,
  replaceCache,
} from '@main/db/notes'
import { readJsonFile, writeJsonFile } from '@main/db/store'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readJsonFile).mockReturnValue([])
  init('/tmp/test')
})

describe('addNote', () => {
  it('should add a valid note', () => {
    const result = addNote({ id: 'note-1', title: 'My Note', content: 'Body text' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('My Note')
      expect(result.data.content).toBe('Body text')
    }
    expect(getNotes()).toHaveLength(1)
  })

  it('should trim title and content', () => {
    const result = addNote({ id: 'note-1', title: '  Title  ', content: '  Body  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Title')
      expect(result.data.content).toBe('Body')
    }
  })

  it('should reject duplicate ID', () => {
    addNote({ id: 'dup', title: 'First', content: 'A' })
    const result = addNote({ id: 'dup', title: 'Second', content: 'B' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('already exists')
  })

  it('should reject empty ID', () => {
    const result = addNote({ id: '', title: 'Test', content: 'Body' })
    expect(result.success).toBe(false)
  })

  it('should reject empty title', () => {
    const result = addNote({ id: 'note-1', title: '', content: 'Body' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('empty')
  })

  it('should prepend new notes (newest first)', () => {
    addNote({ id: 'a', title: 'First', content: '1' })
    addNote({ id: 'b', title: 'Second', content: '2' })
    const notes = getNotes()
    expect(notes[0].id).toBe('b')
    expect(notes[1].id).toBe('a')
  })
})

describe('updateNote', () => {
  beforeEach(() => {
    addNote({ id: 'upd', title: 'Original', content: 'Original body' })
  })

  it('should update title', () => {
    const result = updateNote({ id: 'upd', title: 'New Title' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.title).toBe('New Title')
      expect(result.data?.content).toBe('Original body')
    }
  })

  it('should update content', () => {
    const result = updateNote({ id: 'upd', content: 'New body' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data?.content).toBe('New body')
  })

  it('should return null for non-existent note', () => {
    const result = updateNote({ id: 'nonexistent', title: 'Test' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeNull()
  })

  it('should reject invalid title', () => {
    const result = updateNote({ id: 'upd', title: '' })
    expect(result.success).toBe(false)
  })

  it('should return null for soft-deleted note', () => {
    deleteNote('upd')
    const result = updateNote({ id: 'upd', title: 'Attempt' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeNull()
  })
})

describe('deleteNote', () => {
  it('should soft-delete note (hidden from getNotes but in storage)', () => {
    addNote({ id: 'del', title: 'Delete me', content: 'Body' })
    expect(getNotes()).toHaveLength(1)
    deleteNote('del')
    expect(getNotes()).toHaveLength(0)

    // Verify tombstone in persisted data
    const lastWrite = vi.mocked(writeJsonFile).mock.calls.at(-1)![1] as Array<Record<string, unknown>>
    const deleted = lastWrite.find((n) => n.id === 'del')
    expect(deleted).toBeDefined()
    expect(deleted!.deletedAt).toBeTypeOf('number')
  })

  it('should be a no-op for non-existent note', () => {
    addNote({ id: 'keep', title: 'Keep', content: 'Body' })
    deleteNote('nonexistent')
    expect(getNotes()).toHaveLength(1)
  })

  it('should reject duplicate ID even for soft-deleted note', () => {
    addNote({ id: 'del', title: 'Original', content: 'Body' })
    deleteNote('del')
    const result = addNote({ id: 'del', title: 'Reuse attempt', content: 'Body' })
    expect(result.success).toBe(false)
  })
})

describe('sync helpers', () => {
  it('getAllNotesRaw should include soft-deleted notes', () => {
    addNote({ id: 'active', title: 'Active', content: 'Body' })
    addNote({ id: 'deleted', title: 'Deleted', content: 'Body' })
    deleteNote('deleted')

    expect(getNotes()).toHaveLength(1)
    expect(getAllNotesRaw()).toHaveLength(2)
    expect(getAllNotesRaw().find((n) => n.id === 'deleted')?.deletedAt).toBeTypeOf('number')
  })

  it('getNoteById should find active and deleted notes', () => {
    addNote({ id: 'find-me', title: 'Find Me', content: 'Body' })
    expect(getNoteById('find-me')).toBeDefined()
    expect(getNoteById('find-me')!.title).toBe('Find Me')

    deleteNote('find-me')
    expect(getNoteById('find-me')).toBeDefined()
    expect(getNoteById('find-me')!.deletedAt).toBeTypeOf('number')

    expect(getNoteById('nonexistent')).toBeUndefined()
  })

  it('replaceCache should overwrite cache and persist', () => {
    addNote({ id: 'old', title: 'Old Note', content: 'Body' })
    expect(getNotes()).toHaveLength(1)

    const newNotes = [
      { id: 'new-1', title: 'New Note 1', content: 'Body 1', createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'new-2', title: 'New Note 2', content: 'Body 2', createdAt: Date.now(), updatedAt: Date.now() },
    ]
    replaceCache(newNotes)

    expect(getNotes()).toHaveLength(2)
    expect(getNotes()[0].id).toBe('new-1')
    expect(writeJsonFile).toHaveBeenCalled()
  })
})
