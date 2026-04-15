/**
 * Store Unit Tests
 *
 * Tests for JSON file I/O with error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import { readJsonFile, writeJsonFile, ensureDir } from '@main/db/store'

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('readJsonFile', () => {
  it('should return null for non-existent file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    expect(readJsonFile('/path/data.json')).toBeNull()
  })

  it('should parse and return valid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('[{"id":"1","title":"Test"}]')
    const result = readJsonFile('/path/data.json')
    expect(result).toEqual([{ id: '1', title: 'Test' }])
  })

  it('should return StoreError on invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('{ broken json')
    const result = readJsonFile('/path/data.json') as { type: string }
    expect(result.type).toBe('io_error')
  })

  it('should return StoreError on read failure', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('EACCES')
    })
    const result = readJsonFile('/path/data.json') as { type: string }
    expect(result.type).toBe('io_error')
  })
})

describe('writeJsonFile', () => {
  it('should write atomically (tmp + rename)', () => {
    const result = writeJsonFile('/path/data.json', [{ id: '1' }])
    expect(result).toBeUndefined()
    expect(fs.writeFileSync).toHaveBeenCalledWith('/path/data.json.tmp', expect.any(String))
    expect(fs.renameSync).toHaveBeenCalledWith('/path/data.json.tmp', '/path/data.json')
  })

  it('should return StoreError on write failure', () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('ENOSPC')
    })
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const result = writeJsonFile('/path/data.json', [])
    expect(result).toBeDefined()
    expect(result!.type).toBe('io_error')
    // Should attempt cleanup
    expect(fs.unlinkSync).toHaveBeenCalledWith('/path/data.json.tmp')
  })

  it('should return StoreError on rename failure', () => {
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw new Error('EPERM')
    })
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const result = writeJsonFile('/path/data.json', [])
    expect(result).toBeDefined()
    expect(result!.type).toBe('io_error')
  })
})

describe('ensureDir', () => {
  it('should create directory recursively', () => {
    ensureDir('/path/to/data')
    expect(fs.mkdirSync).toHaveBeenCalledWith('/path/to/data', { recursive: true })
  })
})
