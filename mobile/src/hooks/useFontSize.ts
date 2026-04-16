import { useUIStore } from '../stores/uiStore'

/**
 * Font size hook backed by Zustand + AsyncStorage.
 * Replaces the Electron version which used localStorage directly.
 */
export function useFontSize() {
  const fontSize = useUIStore((s) => s.fontSize)
  const adjustFontSize = useUIStore((s) => s.adjustFontSize)

  const handleFontSizeChange = (delta: number) => {
    adjustFontSize(delta)
  }

  return { fontSize, handleFontSizeChange }
}
