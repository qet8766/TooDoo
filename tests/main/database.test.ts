/**
 * Database Validation Unit Tests
 *
 * Tests for task/note validation logic. These tests check validation
 * that happens before any persistence operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Node.js fs module — validation runs before any file I/O
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}))

// Mock Electron app for getPath('userData')
vi.mock('../../src/main/electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/toodoo-test'),
  },
}))

// Mock broadcast (no-op in tests)
vi.mock('../../src/main/broadcast', () => ({
  broadcastTaskChange: vi.fn(),
  broadcastNotesChange: vi.fn(),
}))

describe('Task Validation', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  describe('title validation', () => {
    it('should reject empty title', async () => {
      const { addTask } = await import('@main/db/database')

      const result = await addTask({
        id: 'test-1',
        title: '',
        category: 'hot',
      })

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('empty')
    })

    it('should reject whitespace-only title', async () => {
      const { addTask } = await import('@main/db/database')

      const result = await addTask({
        id: 'test-2',
        title: '   ',
        category: 'hot',
      })

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('empty')
    })

    it('should reject title exceeding 500 characters', async () => {
      const { addTask } = await import('@main/db/database')

      const result = await addTask({
        id: 'test-3',
        title: 'X'.repeat(501),
        category: 'hot',
      })

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('long')
    })
  })

  describe('description validation', () => {
    it('should reject description exceeding 5000 characters', async () => {
      const { addTask } = await import('@main/db/database')

      const result = await addTask({
        id: 'test-6',
        title: 'Test',
        description: 'Y'.repeat(5001),
        category: 'hot',
      })

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('long')
    })
  })

  describe('category validation', () => {
    it('should reject invalid category', async () => {
      const { addTask } = await import('@main/db/database')

      const result = await addTask({
        id: 'test-9',
        title: 'Test',
        category: 'invalid' as never,
      })

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('category')
    })
  })
})

describe('Notetank Note Validation', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it('should reject empty title', async () => {
    const { addNote } = await import('@main/db/database')

    const result = await addNote({
      id: 'note-1',
      title: '',
      content: 'Content',
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('empty')
  })

  it('should reject title exceeding 200 characters', async () => {
    const { addNote } = await import('@main/db/database')

    const result = await addNote({
      id: 'note-2',
      title: 'X'.repeat(201),
      content: 'Content',
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('long')
  })

  it('should reject content exceeding 50000 characters', async () => {
    const { addNote } = await import('@main/db/database')

    const result = await addNote({
      id: 'note-3',
      title: 'Test',
      content: 'Y'.repeat(50001),
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('long')
  })
})
