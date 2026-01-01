import type { MouseEvent } from 'react'

/** Creates a handler that triggers action on double-click */
export const onDoubleClick = (action: () => void) => (e: MouseEvent) => {
  e.preventDefault()
  if (e.detail >= 2) action()
}
