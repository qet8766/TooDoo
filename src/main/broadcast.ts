import type { BrowserWindow as BrowserWindowType } from 'electron'
import { BrowserWindow } from './electron'
import { IPC } from '@shared/ipc'

export const broadcast = <T>(channel: string, payload?: T) => {
  BrowserWindow.getAllWindows().forEach((win: BrowserWindowType) => {
    win.webContents.send(channel, payload)
  })
}

export const broadcastTaskChange = () => broadcast(IPC.TASKS_CHANGED)
export const broadcastNotesChange = () => broadcast(IPC.NOTES_CHANGED)
