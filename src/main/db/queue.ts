/**
 * Minimal async operation serializer.
 * Ensures enqueued functions execute one at a time, in order.
 */
export const createQueue = () => {
  let pending: Promise<void> = Promise.resolve()

  const enqueue = <T>(fn: () => T): Promise<T> => {
    const run = pending.then(fn)
    // Keep the chain alive regardless of success/failure
    pending = run.then(
      () => {},
      () => {},
    )
    return run
  }

  return { enqueue }
}
