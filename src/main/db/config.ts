import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { app } from '../electron'

// --- Types ---

export type NasConfig = {
  nasPath: string | null       // NAS folder path (machine-specific)
  machineId: string            // Unique ID for this machine
  lastSyncAt: number           // Timestamp of last successful NAS sync
}

// --- Config State ---

let config: NasConfig | null = null
let configPath: string | null = null

// --- Default Config ---

const getDefaultConfig = (): NasConfig => ({
  nasPath: null,
  machineId: crypto.randomUUID(),
  lastSyncAt: 0,
})

// --- Config Path ---

const getConfigPath = (): string => {
  if (configPath) return configPath
  const userDataDir = app.getPath('userData')
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }
  configPath = path.join(userDataDir, 'toodoo-config.json')
  return configPath
}

// --- Load Config ---

export const loadConfig = (): NasConfig => {
  if (config) return config

  // Priority 1: Environment variable
  const envPath = process.env.TOODOO_NAS_PATH
  if (envPath) {
    // Create a config with env path but try to load machineId from existing config
    const existingConfig = loadConfigFromFile()
    config = {
      nasPath: envPath,
      machineId: existingConfig?.machineId ?? crypto.randomUUID(),
      lastSyncAt: existingConfig?.lastSyncAt ?? 0,
    }
    return config
  }

  // Priority 2: Load from config file
  config = loadConfigFromFile() ?? getDefaultConfig()
  return config
}

const loadConfigFromFile = (): NasConfig | null => {
  const filePath = getConfigPath()
  if (!fs.existsSync(filePath)) return null

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<NasConfig>
    return {
      nasPath: parsed.nasPath ?? null,
      machineId: parsed.machineId ?? crypto.randomUUID(),
      lastSyncAt: parsed.lastSyncAt ?? 0,
    }
  } catch (err) {
    console.error('Failed to load config:', err)
    return null
  }
}

// --- Save Config ---

export const saveConfig = (newConfig: NasConfig): void => {
  config = newConfig
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
  } catch (err) {
    console.error('Failed to save config:', err)
  }
}

// --- Init Config (Called on app startup) ---

export const initConfig = (): void => {
  loadConfig()
}

// --- Reload Config (clears cache and reloads from file) ---

export const reloadConfig = (): NasConfig => {
  config = null  // Clear cache
  return loadConfig()
}

// --- Config Accessors ---

export const getConfig = (): NasConfig => {
  return loadConfig()
}

export const getNasPath = (): string | null => {
  return loadConfig().nasPath
}

export const getMachineId = (): string => {
  return loadConfig().machineId
}

export const getLastSyncAt = (): number => {
  return loadConfig().lastSyncAt
}

export const setLastSyncAt = (timestamp: number): void => {
  const cfg = loadConfig()
  cfg.lastSyncAt = timestamp
  saveConfig(cfg)
}

// --- Setup Check ---

export const needsSetup = (): boolean => {
  // If env var is set, no setup needed
  if (process.env.TOODOO_NAS_PATH) return false

  // Check if nasPath is configured
  const cfg = loadConfig()
  return cfg.nasPath === null
}

// --- NAS Path Management ---

export const setNasPath = (nasPath: string): { success: boolean; error?: string } => {
  const trimmed = nasPath.trim()
  if (!trimmed) {
    return { success: false, error: 'Path cannot be empty' }
  }

  const cfg = loadConfig()
  cfg.nasPath = trimmed
  saveConfig(cfg)

  return { success: true }
}

// --- NAS Path Validation ---

export const validateNasPath = async (nasPath: string): Promise<{ valid: boolean; error?: string }> => {
  const trimmed = nasPath.trim()
  if (!trimmed) {
    return { valid: false, error: 'Path cannot be empty' }
  }

  try {
    // Check if path exists
    await fs.promises.access(trimmed, fs.constants.F_OK)
  } catch {
    return { valid: false, error: 'Path does not exist or is not accessible' }
  }

  try {
    // Check read permission
    await fs.promises.access(trimmed, fs.constants.R_OK)
  } catch {
    return { valid: false, error: 'No read permission for this path' }
  }

  try {
    // Check write permission by trying to write a test file
    const testFile = path.join(trimmed, `.toodoo-access-test-${Date.now()}`)
    await fs.promises.writeFile(testFile, 'test')
    await fs.promises.unlink(testFile)
  } catch {
    return { valid: false, error: 'No write permission for this path' }
  }

  return { valid: true }
}

// --- Get Data File Paths ---

export const getNasStorePath = (): string | null => {
  const nasPath = getNasPath()
  if (!nasPath) return null
  return path.join(nasPath, 'toodoo-store.json')
}

export const getNasLockPath = (): string | null => {
  const nasPath = getNasPath()
  if (!nasPath) return null
  return path.join(nasPath, 'toodoo-store.lock')
}

export const getLocalCachePath = (): string => {
  const userDataDir = app.getPath('userData')
  return path.join(userDataDir, 'toodoo-cache.json')
}
