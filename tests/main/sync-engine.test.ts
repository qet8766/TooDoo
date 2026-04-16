/**
 * Sync Engine Unit Tests
 *
 * Tests for push-on-mutate, pull-on-focus, and merge logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock fns so they're available inside vi.mock factories
const { mockIsOnline, mockUpsert, mockFrom } = vi.hoisted(() => {
  const mockIsOnline = vi.fn(() => true)
  const mockUpsert = vi.fn().mockResolvedValue({ error: null })
  const mockFrom = vi.fn(() => ({
    upsert: mockUpsert,
    select: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }))
  return { mockIsOnline, mockUpsert, mockFrom }
})

// Mock store
vi.mock('../../src/main/db/store', () => ({
  readJsonFile: vi.fn(() => null),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}))

// Mock broadcast
vi.mock('../../src/main/broadcast', () => ({
  broadcast: vi.fn(),
  broadcastTaskChange: vi.fn(),
  broadcastNotesChange: vi.fn(),
}))

// Mock the electron shim (sync.ts imports from ../../electron)
vi.mock('../../src/main/electron', () => ({
  app: {
    on: vi.fn(),
    getPath: vi.fn(() => '/mock/userData'),
  },
  net: {
    isOnline: mockIsOnline,
  },
}))

vi.mock('../../src/main/db/sync/supabase', () => ({
  getClient: vi.fn(() => ({ from: mockFrom })),
  getUserId: vi.fn(() => 'user-123'),
  getAuthStatus: vi.fn(() => ({ isSignedIn: true, userId: 'user-123' })),
}))

// Mock tasks and notes modules
vi.mock('../../src/main/db/tasks', () => ({
  getAllTasksRaw: vi.fn(() => []),
  getTaskById: vi.fn(),
  replaceCache: vi.fn(),
}))

vi.mock('../../src/main/db/notes', () => ({
  getAllNotesRaw: vi.fn(() => []),
  getNoteById: vi.fn(),
  replaceCache: vi.fn(),
}))

import { pushEntity, initSync, pull, syncDirtyAndPull, getSyncStatus } from '@main/db/sync/sync'
import { getAuthStatus, getClient, getUserId } from '@main/db/sync/supabase'
import * as taskOps from '@main/db/tasks'
import * as noteOps from '@main/db/notes'
import type { Task, Note } from '@shared/types'

const mockEnqueue = vi.fn(<T>(fn: () => T): Promise<T> => Promise.resolve(fn()))

beforeEach(() => {
  vi.clearAllMocks()
  // Re-establish mocks after mockReset
  mockIsOnline.mockReturnValue(true)
  mockUpsert.mockResolvedValue({ error: null })
  mockFrom.mockImplementation(() => ({
    upsert: mockUpsert,
    select: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }))
  vi.mocked(getAuthStatus).mockReturnValue({ isSignedIn: true, userId: 'user-123' })
  vi.mocked(getClient).mockReturnValue({ from: mockFrom } as ReturnType<typeof getClient>)
  vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([])
  vi.mocked(noteOps.getAllNotesRaw).mockReturnValue([])
  mockEnqueue.mockImplementation(<T>(fn: () => T): Promise<T> => Promise.resolve(fn()))
  initSync('/tmp/test', mockEnqueue)
})

describe('pushEntity', () => {
  it('should call upsert for a task', async () => {
    const task: Task = {
      id: 'task-1',
      title: 'Test',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }

    pushEntity('task', task)
    // pushEntity is fire-and-forget — wait for microtask
    await new Promise((r) => setTimeout(r, 10))

    expect(mockFrom).toHaveBeenCalledWith('tasks')
    expect(mockUpsert).toHaveBeenCalled()
  })

  it('should be a no-op when offline', () => {
    mockIsOnline.mockReturnValue(false)

    const task: Task = {
      id: 'task-1',
      title: 'Test',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }

    pushEntity('task', task)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('should be a no-op when not signed in', () => {
    vi.mocked(getAuthStatus).mockReturnValue({ isSignedIn: false, userId: null })

    const task: Task = {
      id: 'task-1',
      title: 'Test',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }

    pushEntity('task', task)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('pull', () => {
  const makeTaskRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'task-1',
    user_id: 'user-123',
    title: 'Remote Title',
    description: null,
    category: 'hot',
    is_done: false,
    sort_order: 'a0',
    scheduled_date: null,
    scheduled_time: null,
    created_at: new Date(1000).toISOString(),
    updated_at: new Date(3000).toISOString(),
    deleted_at: null,
    ...overrides,
  })

  const makeNoteRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'note-1',
    user_id: 'user-123',
    title: 'Remote Title',
    content: 'Remote content',
    created_at: new Date(1000).toISOString(),
    updated_at: new Date(3000).toISOString(),
    deleted_at: null,
    ...overrides,
  })

  it('should merge remote-newer tasks into local', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Local Title',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        if (table === 'tasks') return Promise.resolve({ data: [makeTaskRow()], error: null })
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    expect(taskOps.replaceCache).toHaveBeenCalled()
    const mergedTasks = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(mergedTasks).toHaveLength(1)
    expect(mergedTasks[0].title).toBe('Remote Title')
  })

  it('should keep local-newer tasks unchanged', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Local Title',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 5000,
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        if (table === 'tasks')
          return Promise.resolve({ data: [makeTaskRow({ updated_at: new Date(2000).toISOString() })], error: null })
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    const mergedTasks = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(mergedTasks[0].title).toBe('Local Title')
  })

  it('should add remote-only tasks to local', async () => {
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([])

    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        if (table === 'tasks')
          return Promise.resolve({ data: [makeTaskRow({ id: 'remote-only', title: 'Remote Only' })], error: null })
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    const mergedTasks = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(mergedTasks).toHaveLength(1)
    expect(mergedTasks[0].id).toBe('remote-only')
  })

  it('should not pull when offline', async () => {
    mockIsOnline.mockReturnValue(false)
    await pull()
    expect(taskOps.replaceCache).not.toHaveBeenCalled()
  })

  it('should merge notes by updatedAt', async () => {
    const localNote: Note = {
      id: 'note-1',
      title: 'Local Title',
      content: 'Local content',
      createdAt: 1000,
      updatedAt: 2000,
    }
    vi.mocked(noteOps.getAllNotesRaw).mockReturnValue([localNote])

    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        if (table === 'notes') return Promise.resolve({ data: [makeNoteRow()], error: null })
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    const mergedNotes = vi.mocked(noteOps.replaceCache).mock.calls[0][0]
    expect(mergedNotes[0].title).toBe('Remote Title')
  })

  it('should handle soft-deleted remote entities', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Active Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        if (table === 'tasks') {
          return Promise.resolve({
            data: [makeTaskRow({ deleted_at: new Date(4000).toISOString(), updated_at: new Date(4000).toISOString() })],
            error: null,
          })
        }
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    const mergedTasks = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(mergedTasks[0].deletedAt).toBeTypeOf('number')
  })
})

describe('pushEntity serialization', () => {
  it('should serialize rapid pushes so the last write wins', async () => {
    const task1: Task = {
      id: 'task-1',
      title: 'Version 1',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }
    const task2: Task = { ...task1, title: 'Version 2', updatedAt: 3000 }

    pushEntity('task', task1)
    pushEntity('task', task2)

    // Wait for chain to drain
    await new Promise((r) => setTimeout(r, 50))

    // Both pushes fire sequentially — last call has the latest state
    const calls = mockUpsert.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][0].title).toBe('Version 1')
    expect(calls[1][0].title).toBe('Version 2')
  })
})

describe('syncDirtyAndPull watermark', () => {
  it('should not advance watermark when pushes fail', async () => {
    const task: Task = {
      id: 'task-dirty',
      title: 'Dirty',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: Date.now() + 100000, // Definitely after lastSyncedAt
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([task])
    vi.mocked(getUserId).mockReturnValue('user-123')

    // Make upsert fail for dirty push
    mockUpsert.mockResolvedValue({ error: { message: 'Server error' } })

    // But pull's select succeeds (returns empty)
    mockFrom.mockImplementation(() => ({
      upsert: mockUpsert,
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }))

    await syncDirtyAndPull()

    // replaceCache should still be called (pull merge runs)
    expect(taskOps.replaceCache).toHaveBeenCalled()

    // But the watermark (lastSyncedAt) should NOT have advanced.
    // We can verify indirectly: writeJsonFile for sync-meta should NOT have been called
    // (saveMeta only runs when advanceWatermark is true)
    const { writeJsonFile } = await import('@main/db/store')
    const metaCalls = vi.mocked(writeJsonFile).mock.calls.filter((c) => String(c[0]).includes('sync-meta'))
    expect(metaCalls).toHaveLength(0)
  })

  it('should advance watermark when all pushes succeed', async () => {
    const task: Task = {
      id: 'task-dirty',
      title: 'Dirty',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: Date.now() + 100000,
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([task])
    vi.mocked(getUserId).mockReturnValue('user-123')

    // Upsert succeeds
    mockUpsert.mockResolvedValue({ error: null })
    mockFrom.mockImplementation(() => ({
      upsert: mockUpsert,
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }))

    await syncDirtyAndPull()

    // Watermark should advance — saveMeta should be called
    const { writeJsonFile } = await import('@main/db/store')
    const metaCalls = vi.mocked(writeJsonFile).mock.calls.filter((c) => String(c[0]).includes('sync-meta'))
    expect(metaCalls.length).toBeGreaterThanOrEqual(1)
  })
})

describe('getSyncStatus', () => {
  it('should return current status', () => {
    const status = getSyncStatus()
    expect(['synced', 'syncing', 'offline', 'error']).toContain(status)
  })
})
