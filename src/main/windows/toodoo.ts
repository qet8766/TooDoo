import { createSingletonWindowManager, createWindow, type WindowConfig } from './base'

const manager = createSingletonWindowManager()

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

export const createTooDooOverlay = () => manager.create(() => createWindow(config))
export const getTooDooOverlay = () => manager.get()
