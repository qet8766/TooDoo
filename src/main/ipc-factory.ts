import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './electron'
import { broadcastTaskChange } from './broadcast'

type Handler<TPayload, TResult> = (payload: TPayload) => TResult | Promise<TResult>

/** Register IPC handler that broadcasts task changes after execution */
export const handleWithBroadcast = <TPayload, TResult>(
  channel: string,
  handler: Handler<TPayload, TResult>,
) => {
  ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, payload: TPayload) => {
    const result = await handler(payload)
    broadcastTaskChange()
    return result
  })
}

/** Register simple IPC handler without broadcast */
export const handleSimple = <TPayload, TResult>(
  channel: string,
  handler: Handler<TPayload, TResult>,
) => {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, payload: TPayload) => handler(payload))
}
