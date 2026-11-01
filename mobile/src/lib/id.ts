import { v4 } from 'uuid'

/**
 * uuid's browser build (what Metro resolves) hard-requires global.crypto.getRandomValues,
 * which on Hermes exists only via the react-native-get-random-values TurboModule. That
 * polyfill looks up its native module lazily — importing it always succeeds, but the first
 * actual call throws when the installed binary was built without the module. Entity IDs
 * only need uniqueness (single-user app), so fall back to Math.random-backed bytes rather
 * than letting every add-task/add-note fail.
 */

const insecureRng = (): Uint8Array => {
  const bytes = new Uint8Array(16)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

let warned = false

export const newId = (): string => {
  try {
    return v4()
  } catch {
    if (!warned) {
      warned = true
      console.warn(
        'crypto.getRandomValues is unavailable — generating IDs with Math.random. ' +
          'Rebuild the app so the react-native-get-random-values native module is included.',
      )
    }
    return v4({ rng: insecureRng })
  }
}
