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
  reorderTask,
  getSyncStatus,
  triggerSync,
  stopSyncScheduler,
  getNotes,
  addNote,
  updateNote,
  deleteNote,
  reinitializeWithNas,
  resetCircuitBreaker,
  recalculateScheduledCategories,
} from './db/database'
import { broadcastTaskChange } from './broadcast'
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
  createNoteEditorWindow,
  closeNoteEditorWindow,
  createSetupWindow,
  waitForSetupComplete,
  completeSetup,
} from './windows'
import { registerShortcut, unregisterShortcut, SHORTCUTS } from './shortcuts'
import { handleWithBroadcast, handleWithNotesBroadcast, handleSimple } from './ipc-factory'

// Prevent cache locking errors on Windows
// These must be set before app.whenReady()
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-http-cache')

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

// --- Scheduled Task Category Recalculation ---
const CATEGORY_RECALC_INTERVAL_MS = 60_000 // Every 60 seconds
let categoryRecalcInterval: ReturnType<typeof setInterval> | null = null

const startCategoryRecalculation = () => {
  if (categoryRecalcInterval) return

  // Run initial recalculation
  const initialUpdates = recalculateScheduledCategories()
  if (initialUpdates > 0) {
    console.log(`Initial category recalculation: updated ${initialUpdates} task(s)`)
    broadcastTaskChange()
  }

  // Set up periodic recalculation
  categoryRecalcInterval = setInterval(() => {
    const updated = recalculateScheduledCategories()
    if (updated > 0) {
      console.log(`Category recalculation: updated ${updated} task(s)`)
      broadcastTaskChange()
    }
  }, CATEGORY_RECALC_INTERVAL_MS)
}

const stopCategoryRecalculation = () => {
  if (categoryRecalcInterval) {
    clearInterval(categoryRecalcInterval)
    categoryRecalcInterval = null
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

  // Start scheduled task category recalculation
  startCategoryRecalculation()

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
  stopCategoryRecalculation()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopSyncScheduler()
  stopCategoryRecalculation()
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
handleWithBroadcast(IPC.TASKS_REORDER, (p: { taskId: string; targetIndex: number }) => {
  const success = reorderTask(p.taskId, p.targetIndex)
  return { success }
})
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

// Switch view by navigating within the same window (no flicker)
ipcMain.on(IPC.SWITCH_VIEW, (_event: IpcMainEvent, view: 'toodoo' | 'notetank') => {
  const win = getTooDooOverlay()
  if (!win) return
  // Navigate within the same window using hash routing
  win.webContents.executeJavaScript(`window.location.hash = '/${view}'`)
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

// --- Focus Mode (Minimize/Expand) ---
const MINIMIZED_HEIGHT = 50
let expandedHeight: number | null = null

ipcMain.on(IPC.WINDOW_SET_MINIMIZED, (_event: IpcMainEvent, isMinimized: boolean) => {
  const win = getTooDooOverlay()
  if (!win) return

  const bounds = win.getBounds()
  if (isMinimized) {
    // Store current height before minimizing
    expandedHeight = bounds.height
    // Allow shrinking to minimized height
    win.setMinimumSize(1, 1)
    win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: MINIMIZED_HEIGHT })
    win.setMinimumSize(bounds.width, MINIMIZED_HEIGHT)
  } else {
    // Restore to expanded height
    const targetHeight = expandedHeight ?? 460
    win.setMinimumSize(1, 1)
    win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: targetHeight })
    win.setMinimumSize(300, 320)
  }
})

// Calendar panel width adjustment
const CALENDAR_WIDTH = 240
let calendarOpen = false
let baseWidth: number | null = null

// Helper to resize window - handles Windows transparent window shrinking issue
const resizeWindow = (win: ReturnType<typeof getTooDooOverlay>, width: number, height: number) => {
  if (!win) return
  const bounds = win.getBounds()

  // To shrink a transparent frameless window on Windows, we must:
  // 1. Temporarily remove minimum size constraints
  // 2. Set bounds explicitly (more reliable than setSize)
  // 3. Restore minimum size
  if (width < bounds.width || height < bounds.height) {
    win.setMinimumSize(1, 1)
  }

  // Use setBounds for more reliable resizing on Windows
  win.setBounds({ x: bounds.x, y: bounds.y, width, height })

  // Restore minimum size
  win.setMinimumSize(300, 320)
}

ipcMain.on(IPC.WINDOW_SET_CALENDAR_OPEN, (_event: IpcMainEvent, isOpen: boolean) => {
  const win = getTooDooOverlay()
  if (!win) return

  // Strict guard: only process if state actually changes
  if (isOpen === calendarOpen) {
    console.log(`[Calendar] Ignoring duplicate call: isOpen=${isOpen}, calendarOpen=${calendarOpen}`)
    return
  }

  const bounds = win.getBounds()
  console.log(`[Calendar] ${isOpen ? 'OPEN' : 'CLOSE'} - current width: ${bounds.width}, baseWidth: ${baseWidth}`)

  if (isOpen) {
    // Store base width before expanding
    baseWidth = bounds.width
    calendarOpen = true
    const newWidth = bounds.width + CALENDAR_WIDTH
    console.log(`[Calendar] Expanding to ${newWidth}`)
    resizeWindow(win, newWidth, bounds.height)
  } else {
    // Restore to stored base width (or calculate from current if missing)
    calendarOpen = false
    const targetWidth = baseWidth ?? Math.max(300, bounds.width - CALENDAR_WIDTH)
    console.log(`[Calendar] Restoring to ${targetWidth} (baseWidth was ${baseWidth})`)
    baseWidth = null
    resizeWindow(win, targetWidth, bounds.height)
  }
})

// Custom window resize handler for frameless window
ipcMain.on(IPC.WINDOW_RESIZE, (_event: IpcMainEvent, deltaWidth: number, deltaHeight: number) => {
  const win = getTooDooOverlay()
  if (!win) return

  const bounds = win.getBounds()
  const newWidth = Math.max(300, bounds.width + deltaWidth)
  const newHeight = Math.max(320, bounds.height + deltaHeight)

  // Only resize if there's actual change
  if (newWidth !== bounds.width || newHeight !== bounds.height) {
    console.log(`[Resize] delta: (${deltaWidth}, ${deltaHeight}), bounds: ${bounds.width}x${bounds.height} → ${newWidth}x${newHeight}`)
    resizeWindow(win, newWidth, newHeight)

    // Update baseWidth if calendar is open (so closing calendar uses correct base)
    if (calendarOpen && baseWidth !== null) {
      baseWidth = newWidth - CALENDAR_WIDTH
      console.log(`[Resize] Updated baseWidth to ${baseWidth}`)
    }
  }
})
