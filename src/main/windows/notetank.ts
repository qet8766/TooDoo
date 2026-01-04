import { createSingletonWindowManager, createWindow, type WindowConfig } from './base'

const manager = createSingletonWindowManager()

const config: WindowConfig = {
  type: 'overlay',
  route: '/notetank',
  width: 340,
  height: 460,
  minWidth: 300,
  minHeight: 320,
  position: 'screen-right',
  resizable: true,
}

export const createNotetankOverlay = () => manager.create(() => createWindow(config))
export const closeNotetankOverlay = () => manager.close()
export const getNotetankOverlay = () => manager.get()
