import { create } from 'zustand'
import { readJson, writeJson } from '../data/persistence'

const UI_KEY = '@toodoo/ui-settings'

type UIState = {
  fontSize: number
}

type UIActions = {
  init: () => Promise<void>
  adjustFontSize: (delta: number) => void
}

export const useUIStore = create<UIState & UIActions>((set, get) => {
  const persist = () => {
    const { fontSize } = get()
    writeJson(UI_KEY, { fontSize })
  }

  return {
    fontSize: 14,

    init: async () => {
      const raw = await readJson<{ fontSize?: number }>(UI_KEY)
      if (raw) {
        set({
          fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 14,
        })
      }
    },

    adjustFontSize: (delta) => {
      const { fontSize } = get()
      const clamped = Math.max(10, Math.min(24, fontSize + delta))
      set({ fontSize: clamped })
      persist()
    },
  }
})
