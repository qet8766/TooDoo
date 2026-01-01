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
  closeOnBlur?: boolean
}

type RendererTarget = {
  devServerUrl?: string
  indexHtml: string
}

let rendererTarget: RendererTarget | null = null

export const configureRendererTarget = (target: RendererTarget) => {
  rendererTarget = target
}

export const getPreloadPath = () => path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')

export const createSingletonWindowManager = () => {
  let win: BrowserWindowType | null = null

  const get = () => win

  const create = (factory: () => BrowserWindowType) => {
    if (win) return win
    win = factory()
    win.on('closed', () => {
      win = null
    })
    return win
  }

  const close = () => {
    win?.close()
  }

  return { get, create, close }
}

export const loadRoute = (win: BrowserWindowType, hashPath: string) => {
  if (!rendererTarget) throw new Error('Renderer target not configured')
  const route = hashPath.startsWith('/') ? hashPath : `/${hashPath}`

  if (rendererTarget.devServerUrl) {
    const hash = route === '/' ? '#/' : `#${route}`
    win.loadURL(`${rendererTarget.devServerUrl}${hash}`)
    return
  }

  win.loadFile(rendererTarget.indexHtml, { hash: route })
}

export const computeCursorPosition = (width: number, height: number) => {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea
  const clampedX = Math.min(Math.max(cursor.x + 12, x), x + areaWidth - width - 8)
  const clampedY = Math.min(Math.max(cursor.y + 12, y), y + areaHeight - height - 8)

  return { x: Math.max(clampedX, x), y: Math.max(clampedY, y) }
}

export const computeScreenRightPosition = (width: number) => {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
  return { x: Math.max(screenWidth - width - 40, 32), y: 48 }
}

const getBaseOptions = (config: WindowConfig): BrowserWindowConstructorOptions => {
  const common: BrowserWindowConstructorOptions = {
    width: config.width,
    height: config.height,
    minWidth: config.minWidth,
    minHeight: config.minHeight,
    title: config.title || 'TooDoo',
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }

  switch (config.type) {
    case 'overlay':
      return {
        ...common,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: config.resizable ?? true,
        focusable: true,
        hasShadow: false,
        show: true,
      }

    case 'popup':
      return {
        ...common,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: config.resizable ?? false,
        focusable: true,
        hasShadow: true,
        show: false,
      }

    default:
      return common
  }
}

const computePosition = (config: WindowConfig): { x?: number; y?: number } => {
  if (!config.position) return {}

  if (typeof config.position === 'object' && 'x' in config.position) {
    return config.position
  }

  switch (config.position) {
    case 'cursor':
      return computeCursorPosition(config.width, config.height)
    case 'screen-right':
      return computeScreenRightPosition(config.width)
    case 'center':
      return {}
    default:
      return {}
  }
}

export const createWindow = (config: WindowConfig): BrowserWindowType => {
  const options = getBaseOptions(config)
  const position = computePosition(config)

  const win = new BrowserWindow({
    ...options,
    ...position,
  })

  if (config.type === 'overlay' || config.type === 'popup') {
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  if (config.type === 'popup') {
    win.on('ready-to-show', () => {
      win.show()
      win.focus()
    })
  }

  if (config.closeOnBlur) {
    win.on('blur', () => {
      win.close()
    })
  }

  loadRoute(win, config.route)
  return win
}

export const repositionWindow = (win: BrowserWindowType, config: WindowConfig) => {
  const position = computePosition(config)
  if (position.x !== undefined && position.y !== undefined) {
    win.setPosition(position.x, position.y)
  }
}
