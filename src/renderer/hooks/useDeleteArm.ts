import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_TIMEOUT_MS = 2000

export function useDeleteArm(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const [armedForDelete, setArmedForDelete] = useState<Set<string>>(new Set())
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = deleteTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [])

  const armForDelete = useCallback(
    (id: string) => {
      const existing = deleteTimers.current.get(id)
      if (existing) clearTimeout(existing)

      setArmedForDelete((prev) => new Set(prev).add(id))

      const timer = setTimeout(() => {
        setArmedForDelete((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        deleteTimers.current.delete(id)
      }, timeoutMs)

      deleteTimers.current.set(id, timer)
    },
    [timeoutMs],
  )

  const disarmDelete = useCallback((id: string) => {
    const timer = deleteTimers.current.get(id)
    if (timer) clearTimeout(timer)
    deleteTimers.current.delete(id)
    setArmedForDelete((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  return { armedForDelete, armForDelete, disarmDelete, deleteTimers }
}
