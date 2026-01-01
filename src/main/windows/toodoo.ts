import type { BrowserWindow as BrowserWindowType } from 'electron'
import { createWindow, type WindowConfig } from './base'

let tooDooOverlay: BrowserWindowType | null = null

const config: WindowConfig = {
  type: 'overlay',
  route: '/toodoo',
  width: 340,
  height: 460,
  minWidth: 300,
  minHeight: 320,
  position: 'screen-right',
  resizable: true,
}

export const createTooDooOverlay = (): BrowserWindowType => {
  if (tooDooOverlay) return tooDooOverlay

  tooDooOverlay = createWindow(config)

  tooDooOverlay.on('closed', () => {
    tooDooOverlay = null
  })

  return tooDooOverlay
}

export const getTooDooOverlay = (): BrowserWindowType | null => tooDooOverlay

export const closeTooDooOverlay = () => {
  tooDooOverlay?.close()
}
