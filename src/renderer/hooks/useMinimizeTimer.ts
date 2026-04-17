import { useCallback, useEffect, useState } from 'react'

const MINIMIZE_DURATION_MS = 60 * 60 * 1000 // 1 hour
const MINIMIZE_CHECK_INTERVAL_MS = 60 * 1000 // check every minute

/**
 * Focus-mode timer for the overlay window.
 *
 * - `handleMinimize` collapses the overlay and starts a 1-hour auto-expand.
 * - `handleExpand` cancels the timer and restores the overlay.
 * - Scorching tasks force-expand and should be guarded against in the UI
 *   (the caller's button passes `isScorchingMode` as `disabled`). When a
 *   scorching task appears while minimized, this hook auto-expands too.
 *
 * Both entry/exit branches push state to the main process via
 * `window.toodoo.setMinimized()` so the BrowserWindow can resize/reshape.
 */
export function useMinimizeTimer(isScorchingMode: boolean): {
  isMinimized: boolean
  handleMinimize: () => void
  handleExpand: () => void
} {
  const [isMinimized, setIsMinimized] = useState(false)
  const [minimizedAt, setMinimizedAt] = useState<number | null>(null)

  const handleMinimize = useCallback(() => {
    setIsMinimized(true)
    setMinimizedAt(Date.now())
    window.toodoo.setMinimized(true)
  }, [])

  const handleExpand = useCallback(() => {
    setIsMinimized(false)
    setMinimizedAt(null)
    window.toodoo.setMinimized(false)
  }, [])

  // Auto-expand after the minimize window elapses.
  useEffect(() => {
    if (!isMinimized || !minimizedAt) return

    const checkExpiry = () => {
      if (Date.now() - minimizedAt >= MINIMIZE_DURATION_MS) {
        handleExpand()
      }
    }

    const interval = setInterval(checkExpiry, MINIMIZE_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isMinimized, minimizedAt, handleExpand])

  // Scorching tasks force-expand.
  useEffect(() => {
    if (isScorchingMode && isMinimized) {
      handleExpand()
    }
  }, [isScorchingMode, isMinimized, handleExpand])

  return { isMinimized, handleMinimize, handleExpand }
}
