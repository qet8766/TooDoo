import { globalShortcut } from '../electron'
import type { ShortcutId } from './definitions'
import { SHORTCUTS } from './definitions'

type ShortcutHandler = () => void | Promise<void>

const registeredHandlers = new Map<ShortcutId, ShortcutHandler>()

export const registerShortcut = (id: ShortcutId, handler: ShortcutHandler): boolean => {
  const definition = SHORTCUTS[id]
  if (!definition) {
    console.warn(`[Shortcuts] Unknown shortcut ID: ${id}`)
    return false
  }

  const { accelerator } = definition

  if (globalShortcut.isRegistered(accelerator)) {
    globalShortcut.unregister(accelerator)
  }

  const success = globalShortcut.register(accelerator, () => {
    void handler()
  })

  if (success) {
    registeredHandlers.set(id, handler)
    console.info(`[Shortcuts] Registered: ${id} (${accelerator})`)
  } else {
    console.warn(`[Shortcuts] Failed to register: ${id} (${accelerator})`)
  }

  return success
}

export const unregisterShortcut = (id: ShortcutId): boolean => {
  const definition = SHORTCUTS[id]
  if (!definition) return false

  const { accelerator } = definition

  if (globalShortcut.isRegistered(accelerator)) {
    globalShortcut.unregister(accelerator)
    registeredHandlers.delete(id)
    console.info(`[Shortcuts] Unregistered: ${id} (${accelerator})`)
    return true
  }

  return false
}

export const isShortcutRegistered = (id: ShortcutId): boolean => {
  const definition = SHORTCUTS[id]
  if (!definition) return false
  return globalShortcut.isRegistered(definition.accelerator)
}

export const unregisterAllShortcuts = () => {
  for (const id of registeredHandlers.keys()) {
    unregisterShortcut(id)
  }
}

export const getRegisteredShortcuts = (): ShortcutId[] => {
  return Array.from(registeredHandlers.keys())
}
