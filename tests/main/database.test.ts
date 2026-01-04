/**
 * Database Validation Unit Tests
 *
 * Tests for task/note validation logic. These tests check validation
 * that happens synchronously before any filesystem operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the electron app and config before importing database
vi.mock('../src/main/electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/mock/${name}`),
    getAppPath: vi.fn(() => '/mock/app'),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

// Mock config module (no NAS for unit tests)
vi.mock('../src/main/db/config', () => ({
  getNasPath: vi.fn(() => null),
  getNasStorePath: vi.fn(() => null),
  getNasLockPath: vi.fn(() => null),
  getLocalCachePath: vi.fn(() => '/mock/userData/toodoo-cache.json'),
  getMachineId: vi.fn(() => 'test-machine-id'),
  getLastSyncAt: vi.fn(() => 0),
  setLastSyncAt: vi.fn(),
}))

// Mock fs at module level - all functions are already mocks
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => JSON.stringify({ tasks: [], notes: [] })),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  openSync: vi.fn(() => 1),
  closeSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { F_OK: 0, R_OK: 4, W_OK: 2 },
}))

describe('Task Validation', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  describe('title validation', () => {
    it('should reject empty title', async () => {
      const { addTask } = await import('@main/db/database')

      const result = addTask({
        id: 'test-1',
        title: '',
        category: 'hot',
      })

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('empty')
    })

    it('should reject whitespace-only title', async () => {
      const { addTask } = await import('@main/db/database')

      const result = addTask({
        id: 'test-2',
        title: '   ',
        category: 'hot',
      })

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('empty')
    })

    it('should reject title exceeding 500 characters', async () => {
      const { addTask } = await import('@main/db/database')

      const result = addTask({
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

      const result = addTask({
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

      const result = addTask({
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

    const result = addNote({
      id: 'note-1',
      title: '',
      content: 'Content',
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('empty')
  })

  it('should reject title exceeding 200 characters', async () => {
    const { addNote } = await import('@main/db/database')

    const result = addNote({
      id: 'note-2',
      title: 'X'.repeat(201),
      content: 'Content',
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('long')
  })

  it('should reject content exceeding 50000 characters', async () => {
    const { addNote } = await import('@main/db/database')

    const result = addNote({
      id: 'note-3',
      title: 'Test',
      content: 'Y'.repeat(50001),
    })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('long')
  })
})
