/**
 * Mobile sync engine tests.
 *
 * Covers parity with desktop:
 *   - doUpsert classifies errors into network/auth/validation/unknown
 *   - pushEntity marks entities dirty; successful push clears the id
 *   - push failure transitions to 'error' with the right reason
 *   - auth-classified failures trigger a single checkAuthHealth within the cooldown
 *   - pull merges remote data via the shared mergeByUpdatedAt combinator
 *
 * Note on mock factory ordering: jest.mock() is hoisted above imports, so
 * any mock helper it closes over must also be defined *inside* the factory.
 * The spies are then extracted from the mocked module after imports resolve.
 */

import type { Task } from '@shared/types'

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn().mockResolvedValue({ isConnected: true }),
    addEventListener: jest.fn(() => jest.fn()),
  },
}))

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}))

jest.mock('../data/persistence', () => ({
  readJson: jest.fn().mockResolvedValue(null),
  writeJson: jest.fn().mockResolvedValue(undefined),
  removeKey: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../data/supabase', () => {
  const mockUpsert = jest.fn().mockResolvedValue({ error: null })
  const mockSelect = jest.fn(() => Promise.resolve({ data: [], error: null }))
  const mockFrom = jest.fn(() => ({ upsert: mockUpsert, select: mockSelect }))
  const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  return {
    __esModule: true,
    getClient: jest.fn(() => ({ from: mockFrom, auth: { getUser: mockGetUser } })),
    getUserId: jest.fn(() => 'user-123'),
    getAuthStatus: jest.fn(() => ({ isSignedIn: true, userId: 'user-123' })),
    markAuthExpired: jest.fn().mockResolvedValue(undefined),
    __mocks: { mockUpsert, mockSelect, mockFrom, mockGetUser },
  }
})

import NetInfo from '@react-native-community/netinfo'
import * as supabaseMod from '../data/supabase'

const mockNetFetch = NetInfo.fetch as unknown as jest.Mock
const { mockUpsert, mockSelect, mockFrom, mockGetUser } = (
  supabaseMod as unknown as {
    __mocks: { mockUpsert: jest.Mock; mockSelect: jest.Mock; mockFrom: jest.Mock; mockGetUser: jest.Mock }
  }
).__mocks
const mockMarkAuthExpired = supabaseMod.markAuthExpired as jest.Mock

import {
  pushEntity,
  pull,
  getSyncStatus,
  getSyncReason,
  getDirtyCount,
  initSync,
  onSyncStatusChanged,
} from '../data/sync'

// --- Helpers ---

const flushAsync = (ms = 20) => new Promise((r) => setTimeout(r, ms))

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: overrides.id ?? 't1',
  title: overrides.title ?? 'Test',
  category: overrides.category ?? 'hot',
  isDone: false,
  sortOrder: 'a0',
  createdAt: 1_700_000_000_000,
  updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockUpsert.mockResolvedValue({ error: null })
  mockSelect.mockImplementation(() => Promise.resolve({ data: [], error: null }))
  mockFrom.mockImplementation(() => ({ upsert: mockUpsert, select: mockSelect }))
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  mockNetFetch.mockResolvedValue({ isConnected: true })
  mockMarkAuthExpired.mockResolvedValue(undefined)

  initSync({
    getAllTasksRaw: () => [],
    replaceTaskCache: () => {},
    getAllNotesRaw: () => [],
    replaceNoteCache: () => {},
    enqueue: <T>(fn: () => T): Promise<T> => Promise.resolve(fn()),
  })
})

// --- Push error classification ---

describe('pushEntity error classification', () => {
  it('classifies JWT expired as auth (status stays on error when user is still valid)', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'JWT expired' } })
    // getUser returns a valid user, so auth-expired transition does not fire.
    pushEntity('task', makeTask())
    await flushAsync()
    expect(getSyncStatus()).toBe('error')
    expect(getSyncReason()).toBe('auth')
  })

  it('classifies PGRST301 code as auth', async () => {
    mockUpsert.mockResolvedValue({ error: { code: 'PGRST301', message: 'JWT missing' } })
    pushEntity('task', makeTask())
    await flushAsync()
    expect(getSyncReason()).toBe('auth')
  })

  it('classifies Postgres 23xxx as validation', async () => {
    mockUpsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    pushEntity('task', makeTask())
    await flushAsync()
    expect(getSyncReason()).toBe('validation')
  })

  it('classifies a thrown fetch failure as network', async () => {
    mockUpsert.mockRejectedValue(new Error('Failed to fetch'))
    pushEntity('task', makeTask())
    await flushAsync()
    expect(getSyncReason()).toBe('network')
  })

  it('classifies an opaque server message as unknown', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'something went wrong' } })
    pushEntity('task', makeTask())
    await flushAsync()
    expect(getSyncReason()).toBe('unknown')
  })
})

// --- Dirty tracking ---

describe('dirty ID tracking', () => {
  it('tracks entity as dirty and clears it on successful push', async () => {
    mockUpsert.mockResolvedValue({ error: null })
    pushEntity('task', makeTask({ id: 'a' }))
    expect(getDirtyCount()).toBe(1)

    await flushAsync()
    expect(getDirtyCount()).toBe(0)
    expect(getSyncStatus()).toBe('synced')
  })

  it('keeps entity dirty when push fails', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'boom' } })
    pushEntity('task', makeTask({ id: 'b' }))
    await flushAsync()
    expect(getDirtyCount()).toBe(1)
    expect(getSyncStatus()).toBe('error')
  })

  it('does not push when offline but still marks dirty (connectivity race fix)', async () => {
    // Connectivity flips to offline between enqueue and chain execution.
    mockNetFetch.mockResolvedValueOnce({ isConnected: false })
    pushEntity('task', makeTask({ id: 'c' }))
    expect(getDirtyCount()).toBe(1)

    await flushAsync()
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(getDirtyCount()).toBe(1) // stays dirty for a later retry
  })
})

// --- Auth health check ---

describe('auth health check on auth failure', () => {
  it('calls markAuthExpired when getUser reports no user', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'JWT expired' } })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } })

    pushEntity('task', makeTask())
    await flushAsync(60)

    expect(getSyncStatus()).toBe('auth-expired')
    expect(mockMarkAuthExpired).toHaveBeenCalledTimes(1)
  })

  it('only runs checkAuthHealth once within the cooldown window', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'JWT expired' } })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } })

    pushEntity('task', makeTask({ id: 'x' }))
    await flushAsync(30)
    pushEntity('task', makeTask({ id: 'y' }))
    await flushAsync(30)

    expect(mockGetUser).toHaveBeenCalledTimes(1)
  })

  it('does not trigger auth check for non-auth reasons', async () => {
    mockUpsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    pushEntity('task', makeTask())
    await flushAsync()

    expect(mockGetUser).not.toHaveBeenCalled()
  })
})

// --- Pull + merge ---

describe('pull merges via mergeByUpdatedAt', () => {
  const remoteRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'r1',
    user_id: 'user-123',
    title: 'Remote',
    description: null,
    category: 'hot',
    is_done: false,
    sort_order: 'a0',
    scheduled_date: null,
    scheduled_time: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  })

  it('replaces local task with remote when remote is newer', async () => {
    const local = makeTask({ id: 'r1', title: 'Local', updatedAt: Date.parse('2024-03-01T00:00:00.000Z') })
    const replaceCache = jest.fn()

    initSync({
      getAllTasksRaw: () => [local],
      replaceTaskCache: replaceCache,
      getAllNotesRaw: () => [],
      replaceNoteCache: () => {},
      enqueue: <T>(fn: () => T): Promise<T> => Promise.resolve(fn()),
    })

    mockFrom.mockImplementation((table: string) => ({
      upsert: mockUpsert,
      select: jest.fn(() => {
        if (table === 'tasks') return Promise.resolve({ data: [remoteRow()], error: null })
        return Promise.resolve({ data: [], error: null })
      }),
    }))

    await pull()

    expect(replaceCache).toHaveBeenCalledTimes(1)
    const merged = replaceCache.mock.calls[0][0] as Task[]
    expect(merged).toHaveLength(1)
    expect(merged[0].title).toBe('Remote')
    expect(getSyncStatus()).toBe('synced')
  })

  it('sets error + auth reason when pull fetch returns a JWT error', async () => {
    mockFrom.mockImplementation(() => ({
      upsert: mockUpsert,
      select: jest.fn(() => Promise.resolve({ data: null, error: { message: 'JWT expired' } })),
    }))

    await pull()
    // Auth health check sees valid user in default mock, so status lands on 'error'.
    expect(getSyncStatus()).toBe('error')
    expect(getSyncReason()).toBe('auth')
  })
})

// --- Listener propagation ---

describe('onSyncStatusChanged', () => {
  it('delivers status + reason together', async () => {
    const listener = jest.fn()
    const unsub = onSyncStatusChanged(listener)

    mockUpsert.mockResolvedValue({ error: { code: '23505', message: 'dup' } })
    pushEntity('task', makeTask())
    await flushAsync()

    expect(listener).toHaveBeenCalledWith('error', 'validation')
    unsub()
  })
})
