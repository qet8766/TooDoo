import fs from 'node:fs'

// --- Types ---

type LockInfo = {
  machineId: string
  acquiredAt: number
  pid: number
  nonce: string  // Unique identifier for this lock acquisition
}

// --- Constants ---

const LOCK_STALE_TIMEOUT_MS = 30_000  // Lock is considered stale after 30 seconds
const LOCK_ACQUIRE_TIMEOUT_MS = 5_000  // Wait up to 5 seconds to acquire lock
const LOCK_RETRY_INTERVAL_MS = 100     // Retry every 100ms

// Network error codes that indicate NAS is unreachable (not just locked)
const NETWORK_ERROR_CODES = new Set([
  'ENETUNREACH',   // Network is unreachable
  'ETIMEDOUT',     // Connection timed out
  'ENOTFOUND',     // Host not found
  'ECONNREFUSED',  // Connection refused
  'EHOSTUNREACH',  // Host unreachable
  'ECONNRESET',    // Connection reset
  'EPIPE',         // Broken pipe
])

// --- Utility ---

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const generateNonce = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

const isNetworkError = (err: unknown): boolean => {
  if (err instanceof Error && 'code' in err && typeof err.code === 'string') {
    return NETWORK_ERROR_CODES.has(err.code)
  }
  return false
}

// --- Lock File Operations ---

const readLockInfo = (lockPath: string): LockInfo | null => {
  try {
    if (!fs.existsSync(lockPath)) return null
    const content = fs.readFileSync(lockPath, 'utf-8')
    return JSON.parse(content) as LockInfo
  } catch {
    return null
  }
}

type LockCreateResult =
  | { created: true }
  | { created: false; reason: 'exists' | 'network' | 'other'; code?: string }

/**
 * Attempt to create lock file exclusively using 'wx' flag.
 * This is atomic on most file systems - file is only created if it doesn't exist.
 */
const tryCreateLockExclusive = (lockPath: string, info: LockInfo): LockCreateResult => {
  let fd: number | null = null
  try {
    // 'wx' flag: Open for writing, fail if file exists (exclusive creation)
    fd = fs.openSync(lockPath, 'wx')
    fs.writeSync(fd, JSON.stringify(info))
    return { created: true }
  } catch (err: unknown) {
    // EEXIST means file already exists - lock is held
    if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
      return { created: false, reason: 'exists' }
    }
    // Network errors - NAS is unreachable
    if (isNetworkError(err)) {
      const code = err instanceof Error && 'code' in err ? String(err.code) : undefined
      console.error('Network error creating lock file:', err)
      return { created: false, reason: 'network', code }
    }
    // Other errors (permissions, etc.) - log and fail
    console.error('Failed to create lock file:', err)
    return { created: false, reason: 'other' }
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd) } catch { /* ignore close errors */ }
    }
  }
}

/**
 * Overwrite existing lock file (used when we already own the lock or clearing stale)
 */
const overwriteLock = (lockPath: string, info: LockInfo): boolean => {
  try {
    // Write to temp file first, then atomic rename
    const tempPath = `${lockPath}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(info))
    fs.renameSync(tempPath, lockPath)
    return true
  } catch (err) {
    console.error('Failed to overwrite lock file:', err)
    return false
  }
}

const deleteLockFile = (lockPath: string): boolean => {
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath)
    }
    return true
  } catch (err) {
    console.error('Failed to delete lock file:', err)
    return false
  }
}

// --- Lock Status ---

export const isLockStale = (lockPath: string, maxAge: number = LOCK_STALE_TIMEOUT_MS): boolean => {
  const info = readLockInfo(lockPath)
  if (!info) return true  // No lock = considered stale (available)

  const age = Date.now() - info.acquiredAt
  return age > maxAge
}

export const getLockOwner = (lockPath: string): LockInfo | null => {
  return readLockInfo(lockPath)
}

// --- Force Clear Lock ---

export const forceClearLock = (lockPath: string): boolean => {
  const info = readLockInfo(lockPath)
  if (info) {
    console.warn(`Force clearing stale lock from machine ${info.machineId} (age: ${Date.now() - info.acquiredAt}ms)`)
  }
  return deleteLockFile(lockPath)
}

// --- Acquire Lock ---

export const acquireLock = async (
  lockPath: string,
  machineId: string,
  timeout: number = LOCK_ACQUIRE_TIMEOUT_MS
): Promise<{ acquired: boolean; error?: string; nonce?: string; networkError?: boolean }> => {
  const startTime = Date.now()
  const ourNonce = generateNonce()
  let encounteredNetworkError = false

  while (Date.now() - startTime < timeout) {
    const existingLock = readLockInfo(lockPath)

    // No lock exists - try to acquire exclusively
    if (!existingLock) {
      const lockInfo: LockInfo = {
        machineId,
        acquiredAt: Date.now(),
        pid: process.pid,
        nonce: ourNonce,
      }

      const result = tryCreateLockExclusive(lockPath, lockInfo)
      if (result.created) {
        // Successfully created lock exclusively - we own it
        return { acquired: true, nonce: ourNonce }
      }

      // Track network errors - if we see one, flag it
      if (result.reason === 'network') {
        encounteredNetworkError = true
        // Don't retry on network errors - NAS is unreachable
        return {
          acquired: false,
          error: `Network error: ${result.code || 'NAS unreachable'}`,
          networkError: true,
        }
      }

      // File was created by someone else between our check and create (EEXIST)
      // This is the race we're handling - just retry
      await sleep(LOCK_RETRY_INTERVAL_MS)
      continue
    }

    // Lock exists - check if it's ours (same machine and PID)
    if (existingLock.machineId === machineId && existingLock.pid === process.pid) {
      // We already have the lock, refresh timestamp and return existing nonce
      const lockInfo: LockInfo = {
        machineId,
        acquiredAt: Date.now(),
        pid: process.pid,
        nonce: existingLock.nonce,  // Keep existing nonce
      }
      overwriteLock(lockPath, lockInfo)
      return { acquired: true, nonce: existingLock.nonce }
    }

    // Lock exists from another machine/process - check if stale
    if (isLockStale(lockPath)) {
      console.warn(`Clearing stale lock from machine ${existingLock.machineId}`)
      if (deleteLockFile(lockPath)) {
        // Successfully cleared stale lock, try to acquire on next iteration
        await sleep(LOCK_RETRY_INTERVAL_MS)
        continue
      }
    }

    // Lock is held by another machine and not stale - wait
    await sleep(LOCK_RETRY_INTERVAL_MS)
  }

  // Timeout - could not acquire lock
  const lockOwner = readLockInfo(lockPath)
  return {
    acquired: false,
    error: lockOwner
      ? `Lock held by machine ${lockOwner.machineId} since ${new Date(lockOwner.acquiredAt).toISOString()}`
      : 'Failed to acquire lock (unknown reason)',
    networkError: encounteredNetworkError,
  }
}

// --- Release Lock ---

export const releaseLock = (lockPath: string, machineId: string): boolean => {
  const info = readLockInfo(lockPath)

  // No lock to release
  if (!info) return true

  // Only release if we own the lock
  if (info.machineId !== machineId) {
    console.warn(`Cannot release lock - owned by ${info.machineId}, not ${machineId}`)
    return false
  }

  // Verify PID matches too for extra safety
  if (info.pid !== process.pid) {
    console.warn(`Lock PID mismatch - owned by PID ${info.pid}, current PID ${process.pid}`)
    // Still release if machine ID matches - the other process may have crashed
  }

  return deleteLockFile(lockPath)
}

// --- Lock Guard (convenience wrapper) ---

export type LockGuard = {
  release: () => void
}

export const withLock = async <T>(
  lockPath: string,
  machineId: string,
  fn: () => T | Promise<T>,
  timeout?: number
): Promise<{ success: true; result: T } | { success: false; error: string }> => {
  const { acquired, error } = await acquireLock(lockPath, machineId, timeout)

  if (!acquired) {
    return { success: false, error: error ?? 'Failed to acquire lock' }
  }

  try {
    const result = await fn()
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    releaseLock(lockPath, machineId)
  }
}
