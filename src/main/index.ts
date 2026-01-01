import path from 'node:path'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
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
import type { TaskCategory } from '@shared/types'
import {
  configureRendererTarget,
  createTooDooOverlay,
  closeTooDooOverlay,
  createQuickAddWindow,
} from './windows'
import { registerShortcut, unregisterShortcut, TOODOO_CATEGORY_SHORTCUTS } from './shortcuts'
import { broadcastTaskChange } from './broadcast'

const devServerUrl =
  process.env.VITE_DEV_SERVER_URL || process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || 'http://localhost:5173/'

const indexHtml = path.join(app.getAppPath(), 'dist', 'index.html')

const registerQuickAddShortcuts = () => {
  for (const [_accelerator, category] of Object.entries(TOODOO_CATEGORY_SHORTCUTS)) {
    const shortcutId = `toodoo:${category}` as const
    registerShortcut(shortcutId, () => {
      createQuickAddWindow(category)
    })
  }
}

const unregisterQuickAddShortcuts = () => {
  for (const [_accelerator, category] of Object.entries(TOODOO_CATEGORY_SHORTCUTS)) {
    const shortcutId = `toodoo:${category}` as const
    unregisterShortcut(shortcutId)
  }
}

const bootstrap = async () => {
  initDatabase()
  configureRendererTarget({ devServerUrl, indexHtml })
  createTooDooOverlay()
  registerQuickAddShortcuts()
}

app.whenReady().then(bootstrap)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createTooDooOverlay()
    registerQuickAddShortcuts()
  }
})

app.on('window-all-closed', () => {
  unregisterQuickAddShortcuts()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Toggle overlay visibility
ipcMain.on('toggle-overlay', (_event: IpcMainEvent, isActive: boolean) => {
  isActive ? createTooDooOverlay() : closeTooDooOverlay()
})

// --- Task Handlers ---
ipcMain.handle('tasks:list', (_event: IpcMainInvokeEvent) => getTasks())

ipcMain.handle(
  'tasks:add',
  (
    _event: IpcMainInvokeEvent,
    payload: { id: string; title: string; description?: string; category: TaskCategory; isDone?: boolean },
  ) => {
    const task = addTask(payload)
    broadcastTaskChange()
    return task
  },
)

ipcMain.handle(
  'tasks:update',
  (_event: IpcMainInvokeEvent, payload: { id: string; title?: string; description?: string | null; isDone?: boolean; category?: TaskCategory }) => {
    const task = updateTask(payload)
    broadcastTaskChange()
    return task
  },
)

ipcMain.handle('tasks:delete', (_event: IpcMainInvokeEvent, id: string) => {
  deleteTask(id)
  broadcastTaskChange()
  return { id }
})

ipcMain.handle('tasks:note:add', (_event: IpcMainInvokeEvent, payload: { id: string; taskId: string; content: string }) => {
  const note = addProjectNote(payload)
  broadcastTaskChange()
  return note
})

ipcMain.handle('tasks:note:delete', (_event: IpcMainInvokeEvent, id: string) => {
  deleteProjectNote(id)
  broadcastTaskChange()
  return { id }
})

ipcMain.on('quick-add:open', (_event: IpcMainEvent, category: string) => {
  createQuickAddWindow(category)
})

// --- Settings Handlers ---
ipcMain.handle('settings:api-url:get', (_event: IpcMainInvokeEvent) => getApiUrlSetting())

ipcMain.handle('settings:api-url:set', (_event: IpcMainInvokeEvent, url: string) => {
  setApiUrlSetting(url)
})

ipcMain.handle('settings:sync-status', (_event: IpcMainInvokeEvent) => getSyncStatus())

ipcMain.handle('settings:trigger-sync', (_event: IpcMainInvokeEvent) => {
  triggerSync()
})
