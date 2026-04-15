/**
 * Validation Unit Tests
 *
 * Tests for shared validation logic (field validators, ID/time format, sanitizers).
 * These are pure functions with no dependencies on Electron or fs.
 */

import { describe, it, expect } from 'vitest'
import {
  validateId,
  validateTaskFields,
  validateProjectNoteFields,
  validateNoteFields,
  isValidTimeFormat,
  sanitizeTask,
  sanitizeNote,
  sanitizeTasks,
  sanitizeNotes,
  LIMITS,
} from '@shared/validation'

describe('validateId', () => {
  it('should reject empty string', () => {
    expect(validateId('')).toContain('non-empty')
  })

  it('should reject whitespace-only string', () => {
    expect(validateId('   ')).toContain('non-empty')
  })

  it('should reject non-string value', () => {
    expect(validateId(123 as unknown)).toContain('non-empty')
    expect(validateId(null as unknown)).toContain('non-empty')
    expect(validateId(undefined as unknown)).toContain('non-empty')
  })

  it('should accept valid ID', () => {
    expect(validateId('abc-123')).toBeNull()
    expect(validateId('550e8400-e29b-41d4-a716-446655440000')).toBeNull()
  })
})

describe('isValidTimeFormat', () => {
  it('should accept valid HH:MM times', () => {
    expect(isValidTimeFormat('00:00')).toBe(true)
    expect(isValidTimeFormat('09:30')).toBe(true)
    expect(isValidTimeFormat('14:45')).toBe(true)
    expect(isValidTimeFormat('23:59')).toBe(true)
  })

  it('should reject invalid times', () => {
    expect(isValidTimeFormat('24:00')).toBe(false)
    expect(isValidTimeFormat('25:00')).toBe(false)
    expect(isValidTimeFormat('12:60')).toBe(false)
    expect(isValidTimeFormat('abc')).toBe(false)
    expect(isValidTimeFormat('1:30')).toBe(false)
    expect(isValidTimeFormat('12:5')).toBe(false)
    expect(isValidTimeFormat('')).toBe(false)
  })
})

describe('validateTaskFields', () => {
  it('should reject empty title', () => {
    expect(validateTaskFields({ title: '' })).toContain('empty')
  })

  it('should reject whitespace-only title', () => {
    expect(validateTaskFields({ title: '   ' })).toContain('empty')
  })

  it('should reject title exceeding limit', () => {
    expect(validateTaskFields({ title: 'X'.repeat(LIMITS.TASK_TITLE_MAX + 1) })).toContain('long')
  })

  it('should reject description exceeding limit', () => {
    expect(validateTaskFields({ description: 'Y'.repeat(LIMITS.TASK_DESCRIPTION_MAX + 1) })).toContain('long')
  })

  it('should reject invalid category', () => {
    expect(validateTaskFields({ category: 'invalid' as never })).toContain('category')
  })

  it('should reject invalid scheduledTime format', () => {
    expect(validateTaskFields({ scheduledTime: '25:00' })).toContain('time format')
    expect(validateTaskFields({ scheduledTime: 'abc' })).toContain('time format')
  })

  it('should accept valid scheduledTime', () => {
    expect(validateTaskFields({ scheduledTime: '14:30' })).toBeNull()
  })

  it('should accept null scheduledTime (clearing)', () => {
    expect(validateTaskFields({ scheduledTime: null })).toBeNull()
  })

  it('should accept valid fields', () => {
    expect(validateTaskFields({ title: 'Test', category: 'hot' })).toBeNull()
  })

  it('should accept partial update (no title)', () => {
    expect(validateTaskFields({ category: 'warm' })).toBeNull()
  })
})

describe('validateProjectNoteFields', () => {
  it('should reject empty content', () => {
    expect(validateProjectNoteFields({ content: '' })).toContain('empty')
  })

  it('should reject content exceeding limit', () => {
    expect(validateProjectNoteFields({ content: 'X'.repeat(LIMITS.PROJECT_NOTE_CONTENT_MAX + 1) })).toContain('long')
  })

  it('should accept valid content', () => {
    expect(validateProjectNoteFields({ content: 'A valid note' })).toBeNull()
  })
})

describe('validateNoteFields', () => {
  it('should reject empty title', () => {
    expect(validateNoteFields({ title: '' })).toContain('empty')
  })

  it('should reject title exceeding limit', () => {
    expect(validateNoteFields({ title: 'X'.repeat(LIMITS.NOTE_TITLE_MAX + 1) })).toContain('long')
  })

  it('should reject content exceeding limit', () => {
    expect(validateNoteFields({ content: 'X'.repeat(LIMITS.NOTE_CONTENT_MAX + 1) })).toContain('long')
  })

  it('should accept valid fields', () => {
    expect(validateNoteFields({ title: 'My Note', content: 'Content' })).toBeNull()
  })
})

describe('sanitizeTask', () => {
  it('should return null for non-objects', () => {
    expect(sanitizeTask(null)).toBeNull()
    expect(sanitizeTask(undefined)).toBeNull()
    expect(sanitizeTask('string')).toBeNull()
    expect(sanitizeTask(42)).toBeNull()
  })

  it('should return null if id is missing', () => {
    expect(sanitizeTask({ title: 'Test' })).toBeNull()
  })

  it('should return null if title is missing', () => {
    expect(sanitizeTask({ id: 'abc' })).toBeNull()
  })

  it('should sanitize a valid task with all fields', () => {
    const raw = {
      id: 'task-1',
      title: 'Buy milk',
      description: 'From the store',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 3,
    }
    const result = sanitizeTask(raw)
    expect(result).toEqual({
      id: 'task-1',
      title: 'Buy milk',
      description: 'From the store',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 3,
      projectNotes: undefined,
      scheduledDate: undefined,
      scheduledTime: undefined,
    })
  })

  it('should default missing optional fields', () => {
    const result = sanitizeTask({ id: 'x', title: 'T' })!
    expect(result.category).toBe('cool')
    expect(result.isDone).toBe(false)
    expect(result.sortOrder).toBe(0)
    expect(result.createdAt).toBeTypeOf('number')
  })

  it('should default invalid category to cool', () => {
    const result = sanitizeTask({ id: 'x', title: 'T', category: 'invalid' })!
    expect(result.category).toBe('cool')
  })

  it('should strip isDeleted field (legacy data)', () => {
    const result = sanitizeTask({ id: 'x', title: 'T', isDeleted: false })!
    expect('isDeleted' in result).toBe(false)
  })

  it('should sanitize embedded projectNotes', () => {
    const raw = {
      id: 'task-1',
      title: 'T',
      projectNotes: [
        { id: 'note-1', taskId: 'task-1', content: 'Hello', createdAt: 1, updatedAt: 2 },
        { invalid: true },
        null,
      ],
    }
    const result = sanitizeTask(raw)!
    expect(result.projectNotes).toHaveLength(1)
    expect(result.projectNotes![0].id).toBe('note-1')
  })
})

describe('sanitizeNote', () => {
  it('should return null for non-objects', () => {
    expect(sanitizeNote(null)).toBeNull()
    expect(sanitizeNote('string')).toBeNull()
  })

  it('should return null if id or title is missing', () => {
    expect(sanitizeNote({ title: 'Test' })).toBeNull()
    expect(sanitizeNote({ id: 'x' })).toBeNull()
  })

  it('should sanitize a valid note', () => {
    const result = sanitizeNote({ id: 'n-1', title: 'My Note', content: 'Body', createdAt: 1, updatedAt: 2 })
    expect(result).toEqual({
      id: 'n-1',
      title: 'My Note',
      content: 'Body',
      createdAt: 1,
      updatedAt: 2,
    })
  })

  it('should default missing content to empty string', () => {
    const result = sanitizeNote({ id: 'n-1', title: 'T' })!
    expect(result.content).toBe('')
  })
})

describe('sanitizeTasks / sanitizeNotes (batch)', () => {
  it('should return empty array for non-array input', () => {
    expect(sanitizeTasks(null)).toEqual([])
    expect(sanitizeTasks('not an array')).toEqual([])
    expect(sanitizeNotes({})).toEqual([])
  })

  it('should filter out malformed entries', () => {
    const raw = [{ id: 'task-1', title: 'Valid' }, null, { invalid: true }, { id: 'task-2', title: 'Also valid' }]
    const result = sanitizeTasks(raw)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('task-1')
    expect(result[1].id).toBe('task-2')
  })
})
