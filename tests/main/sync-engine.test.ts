/**
 * Sync Engine Unit Tests
 *
 * Tests for push-on-mutate, pull-on-focus, and merge logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock fns so they're available inside vi.mock factories
const { mockIsOnline, mockUpsert, mockFrom, mockGetUser } = vi.hoisted(() => {
  const mockIsOnline = vi.fn(() => true)
  const mockUpsert = vi.fn().mockResolvedValue({ error: null })
  const mockFrom = vi.fn(() => ({
    upsert: mockUpsert,
    select: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }))
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  return { mockIsOnline, mockUpsert, mockFrom, mockGetUser }
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
  getClient: vi.fn(() => ({ from: mockFrom, auth: { getUser: mockGetUser } })),
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

import { pushEntity, initSync, pull, syncDirtyAndPull, getSyncStatus, getDirtyCount } from '@main/db/sync/sync'
import { getAuthStatus, getClient, getUserId } from '@main/db/sync/supabase'
import * as taskOps from '@main/db/tasks'
import * as noteOps from '@main/db/notes'
import { broadcast } from '@main/broadcast'
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
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  vi.mocked(getAuthStatus).mockReturnValue({ isSignedIn: true, userId: 'user-123' })
  vi.mocked(getClient).mockReturnValue({ from: mockFrom, auth: { getUser: mockGetUser } } as ReturnType<
    typeof getClient
  >)
  vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([])
  vi.mocked(noteOps.getAllNotesRaw).mockReturnValue([])
  mockEnqueue.mockImplementation(<T>(fn: () => T): Promise<T> => Promise.resolve(fn()))
  initSync('/tmp/test', mockEnqueue)
})

// --- Row factory helpers ---

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

const makeProjectNoteRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pn-1',
  task_id: 'task-1',
  user_id: 'user-123',
  content: 'Remote note content',
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
    expect(['synced', 'syncing', 'offline', 'error', 'auth-expired']).toContain(status)
  })
})

const threeTableMock = (tasks: unknown[] = [], projectNotes: unknown[] = [], notes: unknown[] = []) => {
  mockFrom.mockImplementation((table: string) => ({
    upsert: mockUpsert,
    select: vi.fn(() => {
      if (table === 'tasks') return Promise.resolve({ data: tasks, error: null })
      if (table === 'project_notes') return Promise.resolve({ data: projectNotes, error: null })
      return Promise.resolve({ data: notes, error: null })
    }),
  }))
}

// --- Pull: project note merge ---

describe('pull — project note merge', () => {
  it('should use remote project note when remote is newer', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Local Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 5000,
      sortOrder: 'a0',
      projectNotes: [{ id: 'pn-1', taskId: 'task-1', content: 'Local note', createdAt: 1000, updatedAt: 2000 }],
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    threeTableMock(
      [makeTaskRow({ updated_at: new Date(4000).toISOString() })],
      [makeProjectNoteRow({ updated_at: new Date(3000).toISOString() })],
    )

    await pull()

    const merged = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(merged[0].projectNotes![0].content).toBe('Remote note content')
  })

  it('should keep local project note when local is newer', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Local Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 5000,
      sortOrder: 'a0',
      projectNotes: [{ id: 'pn-1', taskId: 'task-1', content: 'Local note', createdAt: 1000, updatedAt: 5000 }],
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    threeTableMock(
      [makeTaskRow({ updated_at: new Date(4000).toISOString() })],
      [makeProjectNoteRow({ updated_at: new Date(3000).toISOString() })],
    )

    await pull()

    const merged = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(merged[0].projectNotes![0].content).toBe('Local note')
  })

  it('should add remote-only project note to local task', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Local Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 5000,
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    threeTableMock([makeTaskRow({ updated_at: new Date(4000).toISOString() })], [makeProjectNoteRow({ id: 'pn-new' })])

    await pull()

    const merged = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(merged[0].projectNotes).toHaveLength(1)
    expect(merged[0].projectNotes![0].id).toBe('pn-new')
  })

  it('should return undefined projectNotes when both are empty', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Local Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 5000,
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    threeTableMock([makeTaskRow({ updated_at: new Date(4000).toISOString() })])

    await pull()

    const merged = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(merged[0].projectNotes).toBeUndefined()
  })

  it('should merge soft-deleted project note from remote', async () => {
    const localTask: Task = {
      id: 'task-1',
      title: 'Local Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 5000,
      sortOrder: 'a0',
      projectNotes: [{ id: 'pn-1', taskId: 'task-1', content: 'Active note', createdAt: 1000, updatedAt: 2000 }],
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([localTask])

    threeTableMock(
      [makeTaskRow({ updated_at: new Date(4000).toISOString() })],
      [makeProjectNoteRow({ updated_at: new Date(4000).toISOString(), deleted_at: new Date(4000).toISOString() })],
    )

    await pull()

    const merged = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(merged[0].projectNotes![0].deletedAt).toBeTypeOf('number')
  })

  it('should attach remote project notes to remote-only task', async () => {
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([])

    threeTableMock([makeTaskRow({ id: 'remote-task' })], [makeProjectNoteRow({ task_id: 'remote-task' })])

    await pull()

    const merged = vi.mocked(taskOps.replaceCache).mock.calls[0][0]
    expect(merged[0].id).toBe('remote-task')
    expect(merged[0].projectNotes).toHaveLength(1)
  })
})

// --- Pull: error handling ---

describe('pull — error handling', () => {
  it('should set status to error when tasks fetch fails', async () => {
    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        if (table === 'tasks') return Promise.resolve({ data: null, error: { message: 'Network error' } })
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    expect(taskOps.replaceCache).not.toHaveBeenCalled()
    expect(noteOps.replaceCache).not.toHaveBeenCalled()
    expect(getSyncStatus()).toBe('error')
  })

  it('should set status to error when project_notes fetch fails', async () => {
    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        if (table === 'project_notes') return Promise.resolve({ data: null, error: { message: 'Fail' } })
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    expect(taskOps.replaceCache).not.toHaveBeenCalled()
    expect(getSyncStatus()).toBe('error')
  })

  it('should set status to error when fetch throws', async () => {
    mockFrom.mockImplementation(() => ({
      upsert: mockUpsert,
      select: vi.fn(() => {
        throw new Error('Transport error')
      }),
    }))

    await pull()

    expect(taskOps.replaceCache).not.toHaveBeenCalled()
    expect(getSyncStatus()).toBe('error')
  })
})

// --- syncDirtyAndPull: project notes ---

describe('syncDirtyAndPull — project notes', () => {
  it('should push dirty task and its dirty project note', async () => {
    const task: Task = {
      id: 'task-1',
      title: 'Dirty Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: Date.now() + 100000,
      sortOrder: 'a0',
      projectNotes: [
        { id: 'pn-1', taskId: 'task-1', content: 'Dirty note', createdAt: 1000, updatedAt: Date.now() + 100000 },
      ],
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([task])

    threeTableMock()
    await syncDirtyAndPull()

    // Verify upsert was called for both task and project note tables
    const fromCalls = mockFrom.mock.calls.map((c) => c[0])
    expect(fromCalls).toContain('tasks')
    expect(fromCalls).toContain('project_notes')
  })

  it('should push dirty task but skip clean project note', async () => {
    const task: Task = {
      id: 'task-1',
      title: 'Dirty Task',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: Date.now() + 100000,
      sortOrder: 'a0',
      projectNotes: [{ id: 'pn-1', taskId: 'task-1', content: 'Clean note', createdAt: 1000, updatedAt: 0 }],
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([task])

    threeTableMock()
    await syncDirtyAndPull()

    // Filter to only upsert calls (not select calls from pull)
    const upsertFromCalls = mockFrom.mock.calls
      .filter((_call, i) => {
        // The mockFrom returns an object — check if upsert was actually called on it
        // For dirty sync, upsert is called; for pull, select is called
        return mockFrom.mock.results[i]?.value?.upsert === mockUpsert
      })
      .map((c) => c[0])

    // tasks table should be called (task upsert + pull select)
    expect(upsertFromCalls).toContain('tasks')
    // project_notes should only be called for pull select, not for upsert
    // We can verify by checking upsert call count — only 1 (for the task)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })
})

// --- Push failure tracking ---

describe('push failure tracking', () => {
  it('should set status to error and track dirty ID on push failure', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'Server error' } })

    const task: Task = {
      id: 'task-fail',
      title: 'Failing',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }

    pushEntity('task', task)
    await new Promise((r) => setTimeout(r, 50))

    expect(getSyncStatus()).toBe('error')
    expect(getDirtyCount()).toBe(1)
  })

  it('should clear dirty ID and restore synced on successful re-push', async () => {
    // First push fails
    mockUpsert.mockResolvedValue({ error: { message: 'Fail' } })

    const task: Task = {
      id: 'task-retry',
      title: 'Retry',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }

    pushEntity('task', task)
    await new Promise((r) => setTimeout(r, 50))
    expect(getDirtyCount()).toBe(1)

    // Second push succeeds
    mockUpsert.mockResolvedValue({ error: null })
    pushEntity('task', { ...task, updatedAt: 3000 })
    await new Promise((r) => setTimeout(r, 50))

    expect(getDirtyCount()).toBe(0)
    expect(getSyncStatus()).toBe('synced')
  })

  it('should clear all dirty IDs on successful syncDirtyAndPull', async () => {
    // Create dirty state via failed push
    mockUpsert.mockResolvedValue({ error: { message: 'Fail' } })
    const task: Task = {
      id: 'task-dirty',
      title: 'Dirty',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }
    pushEntity('task', task)
    await new Promise((r) => setTimeout(r, 50))
    expect(getDirtyCount()).toBe(1)

    // Now syncDirtyAndPull succeeds
    mockUpsert.mockResolvedValue({ error: null })
    threeTableMock()
    await syncDirtyAndPull()

    expect(getDirtyCount()).toBe(0)
  })
})

// --- Sync guard ---

describe('sync guard', () => {
  it('should prevent concurrent pull during syncDirtyAndPull', async () => {
    // Make syncDirtyAndPull slow by adding a dirty task
    const task: Task = {
      id: 'task-1',
      title: 'Dirty',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: Date.now() + 100000,
      sortOrder: 'a0',
    }
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([task])

    // Slow upsert to simulate network latency
    mockUpsert.mockImplementation(() => new Promise((r) => setTimeout(() => r({ error: null }), 50)))
    threeTableMock()

    const syncPromise = syncDirtyAndPull()

    // Immediately try to pull — should be blocked by syncLock
    await pull()

    // pull() returned immediately without calling replaceCache
    // (syncDirtyAndPull hasn't finished yet)
    expect(taskOps.replaceCache).not.toHaveBeenCalled()

    await syncPromise

    // Now syncDirtyAndPull has finished and called replaceCache via its internal pull
    expect(taskOps.replaceCache).toHaveBeenCalledTimes(1)
  })

  it('should prevent concurrent syncDirtyAndPull calls', async () => {
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([])
    threeTableMock()

    // Slow the pull to keep the lock held
    mockEnqueue.mockImplementation(<T>(fn: () => T): Promise<T> => new Promise((r) => setTimeout(() => r(fn()), 50)))

    const first = syncDirtyAndPull()
    const second = syncDirtyAndPull()

    await Promise.all([first, second])

    // replaceCache should only be called once (from the first sync)
    expect(taskOps.replaceCache).toHaveBeenCalledTimes(1)
  })
})

// --- Auth expiry detection ---

describe('auth expiry detection', () => {
  it('should broadcast auth-expired when getUser fails after push error', async () => {
    // Push fails
    mockUpsert.mockResolvedValue({ error: { message: 'JWT expired' } })
    // Auth check also fails
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid JWT' } })

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
    await new Promise((r) => setTimeout(r, 100))

    expect(getSyncStatus()).toBe('auth-expired')
    expect(broadcast).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ isSignedIn: false, userId: null }),
    )
  })

  it('should not re-check auth within cooldown period', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'Fail' } })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } })

    const task1: Task = {
      id: 'task-1',
      title: 'First',
      category: 'hot',
      isDone: false,
      createdAt: 1000,
      updatedAt: 2000,
      sortOrder: 'a0',
    }
    const task2: Task = { ...task1, id: 'task-2', title: 'Second' }

    pushEntity('task', task1)
    await new Promise((r) => setTimeout(r, 50))

    pushEntity('task', task2)
    await new Promise((r) => setTimeout(r, 50))

    // getUser should only be called once (cooldown blocks second check)
    expect(mockGetUser).toHaveBeenCalledTimes(1)
  })
})

// --- Connectivity polling ---

describe('pollConnectivity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should trigger sync on offline to online transition', async () => {
    // Start offline
    mockIsOnline.mockReturnValue(false)
    initSync('/tmp/test', mockEnqueue)

    // Go online
    mockIsOnline.mockReturnValue(true)
    threeTableMock()

    // Advance past the polling interval
    vi.advanceTimersByTime(30_000)

    // Allow async operations to settle
    await vi.advanceTimersByTimeAsync(100)

    // syncDirtyAndPull should have been triggered (calls replaceCache via pull)
    expect(taskOps.replaceCache).toHaveBeenCalled()
  })

  it('should set status to offline on online to offline transition', () => {
    // Start online
    mockIsOnline.mockReturnValue(true)
    initSync('/tmp/test', mockEnqueue)

    // Go offline
    mockIsOnline.mockReturnValue(false)
    vi.advanceTimersByTime(30_000)

    expect(getSyncStatus()).toBe('offline')
  })

  it('should do nothing when staying online', () => {
    mockIsOnline.mockReturnValue(true)
    initSync('/tmp/test', mockEnqueue)

    vi.advanceTimersByTime(30_000)

    // No sync triggered (mockFrom not called for upsert or select)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('should not sync when going online but not signed in', () => {
    mockIsOnline.mockReturnValue(false)
    vi.mocked(getAuthStatus).mockReturnValue({ isSignedIn: false, userId: null })
    initSync('/tmp/test', mockEnqueue)

    mockIsOnline.mockReturnValue(true)
    vi.advanceTimersByTime(30_000)

    expect(mockFrom).not.toHaveBeenCalled()
  })
})
