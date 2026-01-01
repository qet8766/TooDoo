import path from 'node:path'
import type { IpcMainEvent } from 'electron'
import {
  addProjectNote,
  addTask,
  deleteProjectNote,
  deleteTask,
  getTasks,
  initDatabase,
  updateTask,
  getApiUrlSetting,
  setApiUrlSetting,
  getSyncStatus,
  triggerSync,
} from './db/database'
import { app, BrowserWindow, ipcMain } from './electron'
import { IPC } from '@shared/ipc'
import {
  configureRendererTarget,
  createTooDooOverlay,
  closeTooDooOverlay,
  createQuickAddWindow,
} from './windows'
import { registerShortcut, unregisterShortcut, SHORTCUTS } from './shortcuts'
import { handleWithBroadcast, handleSimple } from './ipc-factory'

const devServerUrl =
  process.env.VITE_DEV_SERVER_URL || process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || 'http://localhost:5173/'

const indexHtml = path.join(app.getAppPath(), 'dist', 'index.html')

const manageShortcuts = (mode: 'register' | 'unregister') => {
  for (const shortcut of Object.values(SHORTCUTS)) {
    if (mode === 'register') {
      registerShortcut(shortcut.id, () => { createQuickAddWindow(shortcut.category) })
    } else {
      unregisterShortcut(shortcut.id)
    }
  }
}

const bootstrap = async () => {
  initDatabase()
  configureRendererTarget({ devServerUrl, indexHtml })
  createTooDooOverlay()
  manageShortcuts('register')
}

app.whenReady().then(bootstrap)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createTooDooOverlay()
    manageShortcuts('register')
  }
})

app.on('window-all-closed', () => {
  manageShortcuts('unregister')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Toggle overlay visibility
ipcMain.on(IPC.TOGGLE_OVERLAY, (_event: IpcMainEvent, isActive: boolean) => {
  if (isActive) {
    createTooDooOverlay()
  } else {
    closeTooDooOverlay()
  }
})

// --- Task Handlers ---
handleSimple(IPC.TASKS_LIST, getTasks)
handleWithBroadcast(IPC.TASKS_ADD, addTask)
handleWithBroadcast(IPC.TASKS_UPDATE, updateTask)
handleWithBroadcast(IPC.TASKS_DELETE, (id: string) => { deleteTask(id); return { id } })
handleWithBroadcast(IPC.TASKS_NOTE_ADD, addProjectNote)
handleWithBroadcast(IPC.TASKS_NOTE_DELETE, (id: string) => { deleteProjectNote(id); return { id } })

ipcMain.on(IPC.QUICK_ADD_OPEN, (_event: IpcMainEvent, category: string) => {
  createQuickAddWindow(category)
})

// --- Settings Handlers ---
handleSimple(IPC.SETTINGS_API_URL_GET, getApiUrlSetting)
handleSimple(IPC.SETTINGS_API_URL_SET, setApiUrlSetting)
handleSimple(IPC.SETTINGS_SYNC_STATUS, getSyncStatus)
handleSimple(IPC.SETTINGS_TRIGGER_SYNC, triggerSync)
