import { describe, expect, it } from 'vitest'
import { fromTaskRow } from '@shared/supabase-types'
import { normalizeCategory } from '@shared/categories'
import { sanitizeTask } from '@shared/validation'

describe('normalizeCategory', () => {
  it('maps legacy "project" to "timed"', () => {
    expect(normalizeCategory('project')).toBe('timed')
  })

  it('passes through valid categories', () => {
    expect(normalizeCategory('scorching')).toBe('scorching')
    expect(normalizeCategory('hot')).toBe('hot')
    expect(normalizeCategory('warm')).toBe('warm')
    expect(normalizeCategory('cool')).toBe('cool')
    expect(normalizeCategory('timed')).toBe('timed')
  })

  it('falls back to "cool" for unknown strings', () => {
    expect(normalizeCategory('bogus')).toBe('cool')
  })

  it('falls back to "cool" for non-strings', () => {
    expect(normalizeCategory(null)).toBe('cool')
    expect(normalizeCategory(undefined)).toBe('cool')
    expect(normalizeCategory(42)).toBe('cool')
    expect(normalizeCategory({})).toBe('cool')
  })
})

describe('fromTaskRow', () => {
  const baseRow = {
    id: 'task-1',
    user_id: 'user-1',
    title: 'Hello',
    description: null,
    category: 'hot',
    is_done: false,
    sort_order: 'a0',
    scheduled_date: null,
    scheduled_time: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
    deleted_at: null,
  }

  it('normalizes legacy "project" category on pull', () => {
    const task = fromTaskRow({ ...baseRow, category: 'project' })
    expect(task.category).toBe('timed')
  })

  it('falls back to "cool" for unrecognized category on pull', () => {
    const task = fromTaskRow({ ...baseRow, category: 'nonsense' })
    expect(task.category).toBe('cool')
  })

  it('preserves valid categories', () => {
    expect(fromTaskRow({ ...baseRow, category: 'scorching' }).category).toBe('scorching')
    expect(fromTaskRow({ ...baseRow, category: 'timed' }).category).toBe('timed')
  })

  it('converts ISO timestamps to unix ms', () => {
    const task = fromTaskRow(baseRow)
    expect(task.createdAt).toBe(Date.parse('2024-01-01T00:00:00.000Z'))
    expect(task.updatedAt).toBe(Date.parse('2024-01-02T00:00:00.000Z'))
  })
})

describe('sanitizeTask category handling', () => {
  it('still migrates legacy "project" via sanitizeTask (load-from-disk path)', () => {
    const task = sanitizeTask({ id: 'x', title: 'x', category: 'project' })
    expect(task?.category).toBe('timed')
  })

  it('still defaults unknown categories to "cool" via sanitizeTask', () => {
    const task = sanitizeTask({ id: 'x', title: 'x', category: 'garbage' })
    expect(task?.category).toBe('cool')
  })
})
