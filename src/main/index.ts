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
  updateProjectNote,
  getSyncStatus,
  triggerSync,
  stopSyncScheduler,
  getNotes,
  addNote,
  updateNote,
  deleteNote,
  reinitializeWithNas,
  resetCircuitBreaker,
} from './db/database'
import {
  initConfig,
  getConfig,
  setNasPath,
  validateNasPath,
  needsSetup,
  reloadConfig,
} from './db/config'
import { app, BrowserWindow, ipcMain, dialog } from './electron'
import { IPC } from '@shared/ipc'
import {
  configureRendererTarget,
  createTooDooOverlay,
  closeTooDooOverlay,
  getTooDooOverlay,
  createQuickAddWindow,
  createNotetankOverlay,
  getNotetankOverlay,
  createNoteEditorWindow,
  closeNoteEditorWindow,
  createSetupWindow,
  waitForSetupComplete,
  completeSetup,
} from './windows'
import { registerShortcut, unregisterShortcut, SHORTCUTS } from './shortcuts'
import { handleWithBroadcast, handleWithNotesBroadcast, handleSimple } from './ipc-factory'

// Only use dev server URL if explicitly set by Vite (not a fallback)
const devServerUrl =
  process.env.VITE_DEV_SERVER_URL || process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || undefined

const indexHtml = path.join(app.getAppPath(), 'dist', 'index.html')

const manageShortcuts = (mode: 'register' | 'unregister') => {
  for (const shortcut of Object.values(SHORTCUTS)) {
    if (mode === 'register') {
      if (shortcut.category === null) {
        // Notetank shortcut - opens note editor
        registerShortcut(shortcut.id, () => { createNoteEditorWindow() })
      } else {
        // Task shortcuts - open quick add
        registerShortcut(shortcut.id, () => { createQuickAddWindow(shortcut.category) })
      }
    } else {
      unregisterShortcut(shortcut.id)
    }
  }
}

const bootstrap = async () => {
  // Initialize configuration first
  initConfig()
  configureRendererTarget({ devServerUrl, indexHtml })

  // Check if NAS path needs to be configured
  if (needsSetup()) {
    createSetupWindow()
    await waitForSetupComplete()
  }

  // Initialize database (starts NAS sync if configured)
  initDatabase()

  // Now show the main overlay and register shortcuts
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
  stopSyncScheduler()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopSyncScheduler()
  manageShortcuts('unregister')
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
handleWithBroadcast(IPC.TASKS_NOTE_UPDATE, updateProjectNote)
handleWithBroadcast(IPC.TASKS_NOTE_DELETE, (id: string) => { deleteProjectNote(id); return { id } })

ipcMain.on(IPC.QUICK_ADD_OPEN, (_event: IpcMainEvent, category: string) => {
  createQuickAddWindow(category)
})

// --- Notetank Notes Handlers ---
handleSimple(IPC.NOTES_LIST, getNotes)
handleWithNotesBroadcast(IPC.NOTES_ADD, addNote)
handleWithNotesBroadcast(IPC.NOTES_UPDATE, updateNote)
handleWithNotesBroadcast(IPC.NOTES_DELETE, (id: string) => { deleteNote(id); return { id } })

ipcMain.on(IPC.NOTE_EDITOR_OPEN, (_event: IpcMainEvent, noteId?: string) => {
  createNoteEditorWindow(noteId)
})

ipcMain.on(IPC.NOTE_EDITOR_CLOSE, () => {
  closeNoteEditorWindow()
})

// Switch view between TooDoo and Notetank (replace/toggle approach)
ipcMain.on(IPC.SWITCH_VIEW, (_event: IpcMainEvent, view: 'toodoo' | 'notetank') => {
  if (view === 'notetank') {
    const toodoo = getTooDooOverlay()
    const bounds = toodoo?.getBounds()
    if (toodoo) toodoo.hide()
    const notetank = createNotetankOverlay()
    if (bounds) notetank.setBounds(bounds)
    notetank.show()
    notetank.focus()
  } else {
    const notetank = getNotetankOverlay()
    const bounds = notetank?.getBounds()
    if (notetank) notetank.hide()
    const toodoo = createTooDooOverlay()
    if (bounds) toodoo.setBounds(bounds)
    toodoo.show()
    toodoo.focus()
  }
})

// --- NAS Configuration Handlers ---
handleSimple(IPC.CONFIG_GET, getConfig)
handleSimple(IPC.CONFIG_SET_NAS_PATH, setNasPath)
handleSimple(IPC.CONFIG_VALIDATE_PATH, validateNasPath)
handleSimple(IPC.CONFIG_NEEDS_SETUP, needsSetup)
handleSimple(IPC.CONFIG_RELOAD, reloadConfig)

// --- NAS Sync Handlers ---
handleSimple(IPC.NAS_SYNC_STATUS, getSyncStatus)
handleSimple(IPC.NAS_TRIGGER_SYNC, triggerSync)
handleSimple(IPC.NAS_RESET_CIRCUIT_BREAKER, resetCircuitBreaker)

// --- Setup Handlers ---
ipcMain.handle(IPC.SETUP_BROWSE_FOLDER, async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select NAS Folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC.SETUP_COMPLETE, async () => {
  // Reinitialize database with new NAS path
  reinitializeWithNas()
  completeSetup()
})
