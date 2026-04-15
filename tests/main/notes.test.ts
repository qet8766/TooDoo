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

import { init, getNotes, addNote, updateNote, deleteNote } from '@main/db/notes'
import { readJsonFile } from '@main/db/store'

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
})

describe('deleteNote', () => {
  it('should remove note from cache', () => {
    addNote({ id: 'del', title: 'Delete me', content: 'Body' })
    expect(getNotes()).toHaveLength(1)
    deleteNote('del')
    expect(getNotes()).toHaveLength(0)
  })

  it('should be a no-op for non-existent note', () => {
    addNote({ id: 'keep', title: 'Keep', content: 'Body' })
    deleteNote('nonexistent')
    expect(getNotes()).toHaveLength(1)
  })
})
