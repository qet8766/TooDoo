import { createSingletonWindowManager, createWindow, loadRoute, repositionWindow, type WindowConfig } from './base'

const manager = createSingletonWindowManager()
const config: WindowConfig = {
  type: 'popup',
  route: '/quick-add',
  width: 360,
  height: 240,
  position: 'cursor',
  resizable: false,
}

export const createQuickAddWindow = (category: string) => {
  const route = `/quick-add?category=${encodeURIComponent(category)}`
  const existing = manager.get()
  if (existing) {
    loadRoute(existing, route)
    repositionWindow(existing, config)
    existing.show()
    existing.focus()
    return existing
  }
  return manager.create(() => createWindow({ ...config, route }))
}
