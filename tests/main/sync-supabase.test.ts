/**
 * Supabase Auth Module Unit Tests
 *
 * Tests for sign-in, sign-out, session persistence, and auth status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock store for session file I/O
vi.mock('../../src/main/db/store', () => ({
  readJsonFile: vi.fn(() => null),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}))

// Mock broadcast
vi.mock('../../src/main/broadcast', () => ({
  broadcast: vi.fn(),
}))

// Define mock auth methods at top level so they persist across resets
const mockAuth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  setSession: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'
import { initSupabase, signIn, signOut, getAuthStatus, restoreSession } from '@main/db/sync/supabase'
import { readJsonFile, writeJsonFile } from '@main/db/store'

beforeEach(() => {
  vi.clearAllMocks()
  // Re-establish createClient mock (mockReset clears it between tests)
  vi.mocked(createClient).mockReturnValue({ auth: mockAuth } as ReturnType<typeof createClient>)
  vi.mocked(readJsonFile).mockReturnValue(null)
  initSupabase('/tmp/test')
})

describe('getAuthStatus', () => {
  it('should return not signed in initially', () => {
    const status = getAuthStatus()
    expect(status.isSignedIn).toBe(false)
    expect(status.userId).toBeNull()
  })
})

describe('signIn', () => {
  it('should return success and persist session on valid credentials', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-123' },
        session: { access_token: 'at-123', refresh_token: 'rt-123' },
      },
      error: null,
    })

    const result = await signIn('test@example.com', 'password123')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.userId).toBe('user-123')
    }
    expect(getAuthStatus().isSignedIn).toBe(true)
    expect(getAuthStatus().userId).toBe('user-123')
    expect(writeJsonFile).toHaveBeenCalledWith(
      expect.stringContaining('auth-session.json'),
      expect.objectContaining({ access_token: 'at-123', refresh_token: 'rt-123' }),
    )
  })

  it('should return failure on invalid credentials', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    })

    const result = await signIn('bad@example.com', 'wrong')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid login credentials')
    }
    expect(getAuthStatus().isSignedIn).toBe(false)
  })

  it('should return failure when no session returned', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    })

    const result = await signIn('test@example.com', 'password')
    expect(result.success).toBe(false)
  })
})

describe('signOut', () => {
  it('should clear session and update auth status', async () => {
    // First sign in
    mockAuth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-123' },
        session: { access_token: 'at', refresh_token: 'rt' },
      },
      error: null,
    })
    await signIn('test@example.com', 'pass')
    expect(getAuthStatus().isSignedIn).toBe(true)

    // Sign out
    mockAuth.signOut.mockResolvedValue({ error: null })
    const result = await signOut()

    expect(result.success).toBe(true)
    expect(getAuthStatus().isSignedIn).toBe(false)
    expect(getAuthStatus().userId).toBeNull()
    // Session file cleared (written with null)
    expect(writeJsonFile).toHaveBeenLastCalledWith(expect.stringContaining('auth-session.json'), null)
  })

  it('should clear session even on sign-out error', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-123' },
        session: { access_token: 'at', refresh_token: 'rt' },
      },
      error: null,
    })
    await signIn('test@example.com', 'pass')

    mockAuth.signOut.mockResolvedValue({ error: { message: 'Network error' } })
    const result = await signOut()

    expect(result.success).toBe(true)
    expect(getAuthStatus().isSignedIn).toBe(false)
  })
})

describe('restoreSession', () => {
  it('should return false when no session file exists', async () => {
    vi.mocked(readJsonFile).mockReturnValue(null)
    const result = await restoreSession()
    expect(result).toBe(false)
  })

  it('should return true and restore userId on valid session', async () => {
    vi.mocked(readJsonFile).mockReturnValue({ access_token: 'at-saved', refresh_token: 'rt-saved' })
    mockAuth.setSession.mockResolvedValue({ error: null })
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-restored' } }, error: null })
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'at-new', refresh_token: 'rt-new' } } })

    const result = await restoreSession()

    expect(result).toBe(true)
    expect(getAuthStatus().isSignedIn).toBe(true)
    expect(getAuthStatus().userId).toBe('user-restored')
  })

  it('should return false and clear session on expired tokens', async () => {
    vi.mocked(readJsonFile).mockReturnValue({ access_token: 'expired', refresh_token: 'expired' })
    mockAuth.setSession.mockResolvedValue({ error: { message: 'Token expired' } })

    const result = await restoreSession()

    expect(result).toBe(false)
    expect(getAuthStatus().isSignedIn).toBe(false)
    // Session file cleared
    expect(writeJsonFile).toHaveBeenCalledWith(expect.stringContaining('auth-session.json'), null)
  })

  it('should return false when getUser fails', async () => {
    vi.mocked(readJsonFile).mockReturnValue({ access_token: 'at', refresh_token: 'rt' })
    mockAuth.setSession.mockResolvedValue({ error: null })
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } })

    const result = await restoreSession()

    expect(result).toBe(false)
    expect(getAuthStatus().isSignedIn).toBe(false)
  })
})
