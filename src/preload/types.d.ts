import type { ToodooAPI } from './index'

declare global {
  interface Window {
    toodoo: ToodooAPI
  }
}

export {}
