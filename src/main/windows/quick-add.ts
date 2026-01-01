import type { BrowserWindow as BrowserWindowType } from 'electron'
import { createSingletonWindowManager, createWindow, loadRoute, repositionWindow, type WindowConfig } from './base'

const quickAddManager = createSingletonWindowManager()

const config: WindowConfig = {
  type: 'popup',
  route: '/quick-add',
  width: 360,
  height: 240,
  position: 'cursor',
  resizable: false,
}

export const createQuickAddWindow = (category: string): BrowserWindowType => {
  const categoryQuery = encodeURIComponent(category)
  const route = `/quick-add?category=${categoryQuery}`

  const existing = quickAddManager.get()
  if (existing) {
    loadRoute(existing, route)
    repositionWindow(existing, config)
    existing.show()
    existing.focus()
    return existing
  }

  return quickAddManager.create(() => createWindow({ ...config, route }))
}

export const getQuickAddWindow = (): BrowserWindowType | null => quickAddManager.get()

export const closeQuickAddWindow = () => {
  quickAddManager.close()
}
