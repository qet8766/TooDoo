import { create } from 'zustand'
import { readJson, writeJson } from '../data/persistence'

const UI_KEY = '@toodoo/ui-settings'

type UIState = {
  fontSize: number
  condensedMode: boolean
}

type UIActions = {
  init: () => Promise<void>
  setFontSize: (size: number) => void
  adjustFontSize: (delta: number) => void
  toggleCondensedMode: () => void
}

export const useUIStore = create<UIState & UIActions>((set, get) => {
  const persist = () => {
    const { fontSize, condensedMode } = get()
    writeJson(UI_KEY, { fontSize, condensedMode })
  }

  return {
    fontSize: 14,
    condensedMode: false,

    init: async () => {
      const raw = await readJson<{ fontSize?: number; condensedMode?: boolean }>(UI_KEY)
      if (raw) {
        set({
          fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 14,
          condensedMode: typeof raw.condensedMode === 'boolean' ? raw.condensedMode : false,
        })
      }
    },

    setFontSize: (size) => {
      const clamped = Math.max(10, Math.min(24, size))
      set({ fontSize: clamped })
      persist()
    },

    adjustFontSize: (delta) => {
      const { fontSize } = get()
      const clamped = Math.max(10, Math.min(24, fontSize + delta))
      set({ fontSize: clamped })
      persist()
    },

    toggleCondensedMode: () => {
      set({ condensedMode: !get().condensedMode })
      persist()
    },
  }
})
