import type { BrowserWindow as BrowserWindowType } from 'electron'
import { createWindow, loadRoute, repositionWindow, type WindowConfig } from './base'

let quickAddWindow: BrowserWindowType | null = null

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

  if (quickAddWindow) {
    loadRoute(quickAddWindow, route)
    repositionWindow(quickAddWindow, config)
    quickAddWindow.show()
    quickAddWindow.focus()
    return quickAddWindow
  }

  quickAddWindow = createWindow({ ...config, route })

  quickAddWindow.on('closed', () => {
    quickAddWindow = null
  })

  return quickAddWindow
}

export const getQuickAddWindow = (): BrowserWindowType | null => quickAddWindow

export const closeQuickAddWindow = () => {
  quickAddWindow?.close()
}
