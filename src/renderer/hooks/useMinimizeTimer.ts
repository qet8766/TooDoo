import { useCallback, useEffect, useRef, useState } from 'react'

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
 * Every minimized-state transition is pushed to the main process via
 * `window.toodoo.setMinimized()` so the BrowserWindow can resize/reshape.
 */
export function useMinimizeTimer(isScorchingMode: boolean): {
  isMinimized: boolean
  handleMinimize: () => void
  handleExpand: () => void
} {
  const [isMinimized, setIsMinimized] = useState(false)
  const [minimizedAt, setMinimizedAt] = useState<number | null>(null)

  // Scorching tasks force-expand, permanently cancelling the minimize timer.
  // State is adjusted during render (react.dev "adjusting state when props
  // change") so the collapsed layout never paints in scorching mode.
  if (isScorchingMode && isMinimized) {
    setIsMinimized(false)
    setMinimizedAt(null)
  }

  const handleMinimize = useCallback(() => {
    setIsMinimized(true)
    setMinimizedAt(Date.now())
  }, [])

  const handleExpand = useCallback(() => {
    setIsMinimized(false)
    setMinimizedAt(null)
  }, [])

  // Push transitions to the main process. Guarded so the initial mount value
  // is never pushed — a spurious setMinimized(false) would reset the window
  // height in the main-process handler.
  const lastPushedRef = useRef(false)
  useEffect(() => {
    if (lastPushedRef.current !== isMinimized) {
      lastPushedRef.current = isMinimized
      window.toodoo.setMinimized(isMinimized)
    }
  }, [isMinimized])

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

  return { isMinimized, handleMinimize, handleExpand }
}
