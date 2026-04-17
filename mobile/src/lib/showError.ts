import type { Result } from '@shared/result'
import { useToastStore } from '../stores/toastStore'

/**
 * Surface a Result's error via the toast host. Returns the data on success,
 * null on failure. Call sites use the null return as a branch point
 * ("bail out, don't navigate") without having to destructure the union.
 */
export const handleResult = <T>(r: Result<T>): T | null => {
  if (!r.success) {
    useToastStore.getState().show(r.error)
    return null
  }
  return r.data
}
