import { useState } from 'react'

const DEFAULT_FONT_SIZE = 14

export function useFontSize(storageKey: string, defaultSize = DEFAULT_FONT_SIZE) {
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved ? parseInt(saved, 10) : defaultSize
  })

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(10, Math.min(24, fontSize + delta))
    setFontSize(newSize)
    localStorage.setItem(storageKey, String(newSize))
  }

  return { fontSize, handleFontSizeChange }
}
