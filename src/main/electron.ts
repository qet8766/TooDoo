import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron')

export const { app, BrowserWindow, ipcMain, screen, globalShortcut } = electron
