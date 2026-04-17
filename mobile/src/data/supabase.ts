import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { readJson, writeJson, removeKey } from './persistence'

const SUPABASE_URL = 'https://envrmnyjyxwqhmfpvajd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVudnJtbnlqeXh3cWhtZnB2YWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDI3MDIsImV4cCI6MjA5MTg3ODcwMn0.0scvbbrjyjoAUD7rOd0meSx9wFNxSO-LO6Wj2X0If5U'

const SESSION_KEY = '@toodoo/auth-session'

let client: SupabaseClient | null = null
let userId: string | null = null

// Status change listeners (Zustand stores subscribe to these)
type AuthStatusListener = (status: { isSignedIn: boolean; userId: string | null }) => void
const listeners: Set<AuthStatusListener> = new Set()

export const onAuthStatusChanged = (fn: AuthStatusListener): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const notifyListeners = (): void => {
  const status = getAuthStatus()
  listeners.forEach((fn) => fn(status))
}

export const initSupabase = (): void => {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
  })

  // Persist refreshed tokens automatically — without this, autoRefreshToken
  // rotates tokens in-memory but AsyncStorage keeps the stale pair, causing
  // cold-start restores to fail after token rotation.
  client.auth.onAuthStateChange((_event, session) => {
    if (session) {
      persistSession(session)
    }
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

const persistSession = async (session: Session): Promise<void> => {
  await writeJson(SESSION_KEY, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}

const clearSession = async (): Promise<void> => {
  await removeKey(SESSION_KEY)
  userId = null
}

/**
 * Flip auth state to signed-out without going through Supabase.
 * Called by the sync engine when a push reveals the session is no longer
 * valid (401/403 or JWT-expired Postgrest error). Mirrors the desktop's
 * IPC broadcast of isSignedIn=false on auth-expired.
 */
export const markAuthExpired = async (): Promise<void> => {
  await clearSession()
  notifyListeners()
}

export const signIn = async (email: string, password: string): Promise<{ userId: string } | { error: string }> => {
  const supabase = getClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  if (!data.session || !data.user) return { error: 'No session returned' }

  userId = data.user.id
  await persistSession(data.session)
  notifyListeners()
  return { userId: data.user.id }
}

export const signOut = async (): Promise<void> => {
  const supabase = getClient()
  const { error } = await supabase.auth.signOut()
  if (error) console.warn('Sign-out error (clearing session anyway):', error.message)

  await clearSession()
  notifyListeners()
}

export const restoreSession = async (): Promise<boolean> => {
  const raw = await readJson<{ access_token: string; refresh_token: string }>(SESSION_KEY)
  if (!raw || !raw.access_token) return false

  const supabase = getClient()

  const { error: setError } = await supabase.auth.setSession({
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
  })
  if (setError) {
    console.warn('Failed to restore session:', setError.message)
    await clearSession()
    return false
  }

  const { data, error: userError } = await supabase.auth.getUser()
  if (userError || !data.user) {
    console.warn('Session invalid:', userError?.message ?? 'no user')
    await clearSession()
    return false
  }

  userId = data.user.id

  // Persist refreshed tokens
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) await persistSession(session)

  notifyListeners()
  return true
}
