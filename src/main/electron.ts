import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// require() returns `any`; assert the real module type so Electron types flow everywhere
const electron = require('electron') as typeof import('electron')

export const { app, BrowserWindow, ipcMain, screen, globalShortcut, net } = electron
