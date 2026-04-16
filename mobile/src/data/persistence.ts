import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * AsyncStorage-backed persistence adapter.
 * Mirrors the Electron store.ts read/write interface but uses AsyncStorage
 * instead of JSON files on disk.
 */

export const readJson = async <T = unknown>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`Failed to read ${key}:`, err)
    return null
  }
}

export const writeJson = async <T>(key: string, data: T): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data))
  } catch (err) {
    console.warn(`Failed to write ${key}:`, err)
  }
}

export const removeKey = async (key: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(key)
  } catch (err) {
    console.warn(`Failed to remove ${key}:`, err)
  }
}
