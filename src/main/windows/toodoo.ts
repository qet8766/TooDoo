import type { BrowserWindow as BrowserWindowType } from 'electron'
import { createSingletonWindowManager, createWindow, type WindowConfig } from './base'

const overlayManager = createSingletonWindowManager()

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
  return overlayManager.create(() => createWindow(config))
}

export const getTooDooOverlay = (): BrowserWindowType | null => overlayManager.get()

export const closeTooDooOverlay = () => {
  overlayManager.close()
}
