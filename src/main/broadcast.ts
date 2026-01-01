import type { BrowserWindow as BrowserWindowType } from 'electron'
import { BrowserWindow } from './electron'

export const CHANNELS = {
  TASKS_CHANGED: 'tasks:changed',
} as const

export type BroadcastChannel = (typeof CHANNELS)[keyof typeof CHANNELS]

export const broadcast = <T>(channel: BroadcastChannel, payload?: T) => {
  BrowserWindow.getAllWindows().forEach((win: BrowserWindowType) => {
    win.webContents.send(channel, payload)
  })
}

export const broadcastTaskChange = () => broadcast(CHANNELS.TASKS_CHANGED)
