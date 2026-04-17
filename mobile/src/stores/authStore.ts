import { create } from 'zustand'
import { initSupabase, signIn, signOut, restoreSession, getAuthStatus } from '../data/supabase'
import { pull } from '../data/sync'

type AuthState = {
  isSignedIn: boolean
  userId: string | null
  isLoading: boolean
  error: string | null
}

type AuthActions = {
  init: () => Promise<void>
  doSignIn: (email: string, password: string) => Promise<boolean>
  doSignOut: () => Promise<void>
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  isSignedIn: false,
  userId: null,
  isLoading: true,
  error: null,

  init: async () => {
    initSupabase()
    const restored = await restoreSession()
    const status = getAuthStatus()
    set({
      isSignedIn: restored,
      userId: status.userId,
      isLoading: false,
    })
    if (restored) pull()
  },

  doSignIn: async (email, password) => {
    set({ isLoading: true, error: null })
    const result = await signIn(email, password)
    if ('error' in result) {
      set({ isLoading: false, error: result.error })
      return false
    }
    set({ isSignedIn: true, userId: result.userId, isLoading: false, error: null })
    pull()
    return true
  },

  doSignOut: async () => {
    await signOut()
    set({ isSignedIn: false, userId: null, error: null })
  },
}))
