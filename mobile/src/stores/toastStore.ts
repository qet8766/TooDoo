import { create } from 'zustand'

const TOAST_DURATION_MS = 2500

type ToastState = { message: string | null }
type ToastActions = {
  show: (message: string) => void
  dismiss: () => void
}

export const useToastStore = create<ToastState & ToastActions>((set) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    message: null,
    show: (message) => {
      if (timer) clearTimeout(timer)
      set({ message })
      timer = setTimeout(() => {
        set({ message: null })
        timer = null
      }, TOAST_DURATION_MS)
    },
    dismiss: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      set({ message: null })
    },
  }
})
