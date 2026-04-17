import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './electron'

type Handler<TPayload, TResult> = (payload: TPayload) => TResult | Promise<TResult>

/** Returns true if the result is a failed Result object (skip onSuccess on errors). */
const isFailedResult = (result: unknown): boolean =>
  typeof result === 'object' &&
  result !== null &&
  'success' in result &&
  (result as { success: boolean }).success === false

/**
 * Register an invoke-style IPC handler. If `onSuccess` is provided, it runs
 * after a successful handler invocation (skipped when the handler returns a
 * failed Result<T>). Pass `broadcastTaskChange` / `broadcastNotesChange` from
 * `./broadcast` for mutation channels; omit for read-only channels.
 */
export const handle = <TPayload, TResult>(
  channel: string,
  handler: Handler<TPayload, TResult>,
  onSuccess?: () => void,
) => {
  ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, payload: TPayload) => {
    const result = await handler(payload)
    if (onSuccess && !isFailedResult(result)) onSuccess()
    return result
  })
}
