import fs from 'node:fs'

export type StoreError = { type: 'io_error'; message: string; cause?: unknown }

const isStoreError = (value: unknown): value is StoreError =>
  typeof value === 'object' && value !== null && (value as StoreError).type === 'io_error'

/** Ensure a directory exists. */
export const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true })
}

/** Read and parse a JSON file. Returns parsed data or a StoreError. */
export const readJsonFile = (filePath: string): unknown | StoreError => {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    return { type: 'io_error', message: `Failed to read ${filePath}`, cause: err } satisfies StoreError
  }
}

/**
 * Atomically write data to a JSON file (write .tmp + rename).
 * On failure, logs the error and cleans up the .tmp file. Does NOT throw.
 */
export const writeJsonFile = (filePath: string, data: unknown): StoreError | undefined => {
  const tmp = filePath + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, filePath)
  } catch (err) {
    const storeErr: StoreError = { type: 'io_error', message: `Failed to write ${filePath}`, cause: err }
    console.error(storeErr.message, err)
    // Clean up orphaned .tmp file
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {
      // Ignore cleanup failures
    }
    return storeErr
  }
}

export { isStoreError }
