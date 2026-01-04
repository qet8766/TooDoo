import { exec } from 'node:child_process'
import { globalShortcut } from '../electron'
import type { ShortcutId } from './definitions'
import { SHORTCUTS } from './definitions'

// Force CapsLock OFF using Windows API (not toggle - always off)
const forceCapsLockOff = () => {
  const psCommand = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);' -Name 'Keyboard' -Namespace 'Win32'
Add-Type -A System.Windows.Forms
if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) {
  [Win32.Keyboard]::keybd_event(0x14, 0x45, 1, [UIntPtr]::Zero)
  [Win32.Keyboard]::keybd_event(0x14, 0x45, 3, [UIntPtr]::Zero)
}
`.replace(/\n/g, ' ')

  exec(`powershell -NoProfile -Command "${psCommand}"`, { windowsHide: true })
}

export const registerShortcut = (id: ShortcutId, handler: () => void | Promise<void>): boolean => {
  const def = SHORTCUTS[id]
  if (!def) return false
  if (globalShortcut.isRegistered(def.accelerator)) globalShortcut.unregister(def.accelerator)

  // Wrap handler to force CapsLock OFF if that's the accelerator
  const wrappedHandler = def.accelerator === 'CapsLock'
    ? () => { forceCapsLockOff(); void handler() }
    : () => void handler()

  return globalShortcut.register(def.accelerator, wrappedHandler)
}

export const unregisterShortcut = (id: ShortcutId): boolean => {
  const def = SHORTCUTS[id]
  if (!def || !globalShortcut.isRegistered(def.accelerator)) return false
  globalShortcut.unregister(def.accelerator)
  return true
}
