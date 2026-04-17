import type { ToodooAPI } from '../../src/preload'

declare global {
  interface Window {
    toodoo: ToodooAPI
  }
}
