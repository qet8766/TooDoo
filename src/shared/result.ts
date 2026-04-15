/** Discriminated union for operation results. */
export type Result<T> = { success: true; data: T } | { success: false; error: string }

/** Wrap a successful value. */
export const ok = <T>(data: T): Result<T> => ({ success: true, data })

/** Wrap an error message. Typed as Result<never> so it's assignable to any Result<T>. */
export const fail = (error: string): Result<never> => ({ success: false, error })
