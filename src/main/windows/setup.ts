import type { BrowserWindow as BrowserWindowType } from 'electron'
import { BrowserWindow, app } from '../electron'
import { getPreloadPath, loadRoute } from './base'

let setupWindow: BrowserWindowType | null = null
let setupResolve: (() => void) | null = null

export const createSetupWindow = (): BrowserWindowType => {
  if (setupWindow) {
    setupWindow.focus()
    return setupWindow
  }

  const win = new BrowserWindow({
    width: 500,
    height: 400,
    title: 'TooDoo Setup',
    autoHideMenuBar: true,
    frame: true,
    transparent: false,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.on('closed', () => {
    setupWindow = null
    // If closed without completing, quit the app
    if (setupResolve === null) {
      app.quit()
    }
  })

  loadRoute(win, '/setup')
  setupWindow = win
  return win
}

export const getSetupWindow = (): BrowserWindowType | null => setupWindow

export const closeSetupWindow = (): void => {
  setupWindow?.close()
  setupWindow = null
}

// Wait for setup to complete
export const waitForSetupComplete = (): Promise<void> => {
  return new Promise((resolve) => {
    setupResolve = resolve
  })
}

// Called when setup is complete
export const completeSetup = (): void => {
  if (setupResolve) {
    setupResolve()
    setupResolve = null
  }
  closeSetupWindow()
}
