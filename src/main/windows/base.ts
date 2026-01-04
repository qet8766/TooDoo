import path from 'node:path'
import type { BrowserWindow as BrowserWindowType, BrowserWindowConstructorOptions } from 'electron'
import { app, BrowserWindow, screen } from '../electron'

export type WindowType = 'overlay' | 'popup'
export type WindowConfig = {
  type: WindowType
  route: string
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  position?: 'cursor' | 'screen-right' | 'center' | { x: number; y: number }
  resizable?: boolean
  title?: string
}

let rendererTarget: { devServerUrl?: string; indexHtml: string } | null = null

export const configureRendererTarget = (target: typeof rendererTarget) => { rendererTarget = target }
export const getPreloadPath = () => path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')

export const createSingletonWindowManager = () => {
  let win: BrowserWindowType | null = null
  return {
    get: () => win,
    create: (factory: () => BrowserWindowType) => { if (win) return win; win = factory(); win.on('closed', () => { win = null }); return win },
    close: () => win?.close(),
  }
}

export const loadRoute = (win: BrowserWindowType, hashPath: string) => {
  if (!rendererTarget) throw new Error('Renderer target not configured')
  const route = hashPath.startsWith('/') ? hashPath : `/${hashPath}`
  if (rendererTarget.devServerUrl) {
    win.loadURL(`${rendererTarget.devServerUrl}${route === '/' ? '#/' : `#${route}`}`)
  } else {
    win.loadFile(rendererTarget.indexHtml, { hash: route })
  }
}

const computePosition = (config: WindowConfig): { x?: number; y?: number } => {
  if (!config.position || config.position === 'center') return {}
  if (typeof config.position === 'object') return config.position

  if (config.position === 'cursor') {
    const cursor = screen.getCursorScreenPoint()
    const { x, y, width: w, height: h } = screen.getDisplayNearestPoint(cursor).workArea
    return { x: Math.max(x, Math.min(cursor.x + 12, x + w - config.width - 8)), y: Math.max(y, Math.min(cursor.y + 12, y + h - config.height - 8)) }
  }

  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  return { x: Math.max(sw - config.width - 40, 32), y: 48 }
}

const typeOptions: Record<WindowType, Partial<BrowserWindowConstructorOptions>> = {
  overlay: { frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: true, hasShadow: false, show: true },
  popup: { frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: true, hasShadow: true, show: false },
}

export const createWindow = (config: WindowConfig): BrowserWindowType => {
  const win = new BrowserWindow({
    width: config.width, height: config.height, minWidth: config.minWidth, minHeight: config.minHeight,
    title: config.title || 'TooDoo', autoHideMenuBar: true,
    webPreferences: { preload: getPreloadPath(), contextIsolation: true, nodeIntegration: false },
    resizable: config.resizable ?? config.type === 'overlay',
    ...typeOptions[config.type],
    ...computePosition(config),
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (config.type === 'popup') win.on('ready-to-show', () => { win.show(); win.focus() })

  loadRoute(win, config.route)
  return win
}

export const repositionWindow = (win: BrowserWindowType, config: WindowConfig) => {
  const pos = computePosition(config)
  if (pos.x !== undefined && pos.y !== undefined) win.setPosition(pos.x, pos.y)
}
