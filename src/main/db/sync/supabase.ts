import path from 'node:path'
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import type { Result } from '@shared/result'
import { ok, fail } from '@shared/result'
import { IPC } from '@shared/ipc'
import { readJsonFile, writeJsonFile } from '../store'
import { broadcast } from '../../broadcast'

const SUPABASE_URL = 'https://envrmnyjyxwqhmfpvajd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVudnJtbnlqeXh3cWhtZnB2YWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDI3MDIsImV4cCI6MjA5MTg3ODcwMn0.0scvbbrjyjoAUD7rOd0meSx9wFNxSO-LO6Wj2X0If5U'

let client: SupabaseClient | null = null
let userId: string | null = null
let sessionFilePath = ''

export const isSyncDisabled = (): boolean => process.env.TOODOO_DISABLE_SYNC === '1'

export const initSupabase = (userDataPath: string): void => {
  sessionFilePath = path.join(userDataPath, 'auth-session.json')
  userId = null
  if (isSyncDisabled()) {
    client = null
    return
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
  })

  // Supabase rotates the refresh token on every auto-refresh. Without this
  // listener, the rotated token is only in memory — next launch reads the stale
  // refresh token from disk and sign-in appears to have expired.
  client.auth.onAuthStateChange((event, session) => {
    if (session) {
      persistSession(session)
      if (session.user) userId = session.user.id
    } else if (event === 'SIGNED_OUT') {
      clearSession()
    }
    broadcastAuthStatus()
  })
}

export const getClient = (): SupabaseClient => {
  if (!client) throw new Error('Supabase client not initialized — call initSupabase() first')
  return client
}

export const getUserId = (): string | null => userId

export const getAuthStatus = (): { isSignedIn: boolean; userId: string | null } => ({
  isSignedIn: userId !== null,
  userId,
})

const persistSession = (session: Session): void => {
  writeJsonFile(sessionFilePath, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}

const clearSession = (): void => {
  writeJsonFile(sessionFilePath, null)
  userId = null
}

const broadcastAuthStatus = (): void => {
  broadcast(IPC.AUTH_STATUS_CHANGED, getAuthStatus())
}

export const signIn = async (email: string, password: string): Promise<Result<{ userId: string }>> => {
  if (!client) return fail('Sync disabled')
  const supabase = client
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return fail(error.message)
  if (!data.session || !data.user) return fail('No session returned')

  userId = data.user.id
  persistSession(data.session)
  broadcastAuthStatus()
  return ok({ userId: data.user.id })
}

export const signOut = async (): Promise<Result<void>> => {
  if (!client) {
    clearSession()
    broadcastAuthStatus()
    return ok(undefined)
  }
  const { error } = await client.auth.signOut()
  if (error) console.warn('Sign-out error (clearing session anyway):', error.message)

  clearSession()
  broadcastAuthStatus()
  return ok(undefined)
}

export const restoreSession = async (): Promise<boolean> => {
  if (!client) return false
  const raw = readJsonFile(sessionFilePath)
  if (!raw || typeof raw !== 'object' || !('access_token' in raw)) return false

  const tokens = raw as { access_token: string; refresh_token: string }
  const supabase = client

  const { error: setError } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  })
  if (setError) {
    console.warn('Failed to restore session:', setError.message)
    clearSession()
    return false
  }

  const { data, error: userError } = await supabase.auth.getUser()
  if (userError || !data.user) {
    console.warn('Session invalid:', userError?.message ?? 'no user')
    clearSession()
    return false
  }

  userId = data.user.id

  // Persist refreshed tokens
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) persistSession(session)

  broadcastAuthStatus()
  return true
}
