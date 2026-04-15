import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './electron'
import { broadcastTaskChange, broadcastNotesChange } from './broadcast'

type Handler<TPayload, TResult> = (payload: TPayload) => TResult | Promise<TResult>

/** Returns true if the result is a failed Result object (skip broadcast on errors). */
const isFailedResult = (result: unknown): boolean =>
  typeof result === 'object' &&
  result !== null &&
  'success' in result &&
  (result as { success: boolean }).success === false

/** Register IPC handler that broadcasts task changes after execution */
export const handleWithBroadcast = <TPayload, TResult>(channel: string, handler: Handler<TPayload, TResult>) => {
  ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, payload: TPayload) => {
    const result = await handler(payload)
    if (!isFailedResult(result)) broadcastTaskChange()
    return result
  })
}

/** Register IPC handler that broadcasts notes changes after execution */
export const handleWithNotesBroadcast = <TPayload, TResult>(channel: string, handler: Handler<TPayload, TResult>) => {
  ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, payload: TPayload) => {
    const result = await handler(payload)
    if (!isFailedResult(result)) broadcastNotesChange()
    return result
  })
}

/** Register simple IPC handler without broadcast */
export const handleSimple = <TPayload, TResult>(channel: string, handler: Handler<TPayload, TResult>) => {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, payload: TPayload) => handler(payload))
}
