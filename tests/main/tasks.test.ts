/**
 * Task Domain Logic Unit Tests
 *
 * Tests for task CRUD, project notes, sort ordering, and category recalculation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock store to avoid real file I/O
vi.mock('../../src/main/db/store', () => ({
  readJsonFile: vi.fn(() => []),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}))

import {
  init,
  getTasks,
  addTask,
  updateTask,
  reorderTask,
  deleteTask,
  addProjectNote,
  updateProjectNote,
  deleteProjectNote,
  getAllTasksRaw,
  getTaskById,
  replaceCache,
} from '@main/db/tasks'
import { readJsonFile, writeJsonFile } from '@main/db/store'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readJsonFile).mockReturnValue([])
  init('/tmp/test')
})

describe('addTask', () => {
  it('should add a valid task', () => {
    const result = addTask({ id: 'task-1', title: 'Buy milk', category: 'hot' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('task-1')
      expect(result.data.title).toBe('Buy milk')
      expect(result.data.category).toBe('hot')
      expect(result.data.isDone).toBe(false)
      expect(result.data.sortOrder).toBeTypeOf('string')
    }
  })

  it('should trim title and description', () => {
    const result = addTask({ id: 'task-1', title: '  Buy milk  ', description: '  from store  ', category: 'hot' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Buy milk')
      expect(result.data.description).toBe('from store')
    }
  })

  it('should reject duplicate ID', () => {
    addTask({ id: 'dup-1', title: 'First', category: 'hot' })
    const result = addTask({ id: 'dup-1', title: 'Second', category: 'hot' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('already exists')
    }
  })

  it('should reject empty ID', () => {
    const result = addTask({ id: '', title: 'Test', category: 'hot' })
    expect(result.success).toBe(false)
  })

  it('should reject empty title', () => {
    const result = addTask({ id: 'task-1', title: '', category: 'hot' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('empty')
  })

  it('should reject invalid category', () => {
    const result = addTask({ id: 'task-1', title: 'Test', category: 'invalid' as never })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('category')
  })

  it('should assign fractional sortOrder with newest task sorting first', () => {
    addTask({ id: 'a', title: 'First', category: 'hot' })
    addTask({ id: 'b', title: 'Second', category: 'hot' })

    const tasks = getTasks()
    const hotTasks = tasks
      .filter((t) => t.category === 'hot')
      .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0))
    expect(hotTasks[0].id).toBe('b') // newest at top
    expect(hotTasks[1].id).toBe('a')
    expect(hotTasks[0].sortOrder < hotTasks[1].sortOrder).toBe(true)
  })

  it('should not modify other tasks sortOrder when adding', () => {
    addTask({ id: 'a', title: 'First', category: 'hot' })
    const firstSortOrder = getTasks().find((t) => t.id === 'a')!.sortOrder

    addTask({ id: 'b', title: 'Second', category: 'hot' })
    const afterSecondAdd = getTasks().find((t) => t.id === 'a')!.sortOrder

    expect(afterSecondAdd).toBe(firstSortOrder)
  })

  it('should not shift tasks in other categories', () => {
    addTask({ id: 'a', title: 'Hot task', category: 'hot' })
    const hotSortOrder = getTasks().find((t) => t.id === 'a')!.sortOrder

    addTask({ id: 'b', title: 'Warm task', category: 'warm' })
    const hotSortOrderAfter = getTasks().find((t) => t.id === 'a')!.sortOrder

    expect(hotSortOrderAfter).toBe(hotSortOrder)
  })

  it('should keep the assigned category for scheduled tasks (no auto-promotion)', () => {
    const farFuture = Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days out
    const result = addTask({
      id: 'sched-1',
      title: 'Future task',
      category: 'timed',
      scheduledDate: farFuture,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('timed')
    }
  })

  it('should reject invalid scheduledTime format', () => {
    const result = addTask({
      id: 'task-1',
      title: 'Test',
      category: 'hot',
      scheduledTime: '25:00',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('time format')
  })
})

describe('updateTask', () => {
  beforeEach(() => {
    addTask({ id: 'u-1', title: 'Original', description: 'Desc', category: 'hot' })
  })

  it('should update title', () => {
    const result = updateTask({ id: 'u-1', title: 'Updated' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.title).toBe('Updated')
    }
  })

  it('should return null for non-existent task', () => {
    const result = updateTask({ id: 'nonexistent', title: 'Test' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeNull()
  })

  it('should return null for soft-deleted task', () => {
    deleteTask('u-1')
    const result = updateTask({ id: 'u-1', title: 'Attempt' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeNull()
  })

  it('should clear description with null', () => {
    const result = updateTask({ id: 'u-1', description: null })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data?.description).toBeUndefined()
  })

  it('should move to top of category when category changes', () => {
    addTask({ id: 'u-2', title: 'Already warm', category: 'warm' })
    const warmSortOrder = getTasks().find((t) => t.id === 'u-2')!.sortOrder

    const result = updateTask({ id: 'u-1', category: 'warm' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.category).toBe('warm')
      expect(result.data!.sortOrder < warmSortOrder).toBe(true)
    }
  })

  it('should toggle isDone', () => {
    const result = updateTask({ id: 'u-1', isDone: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data?.isDone).toBe(true)
  })
})

describe('reorderTask', () => {
  beforeEach(() => {
    addTask({ id: 'r-1', title: 'First', category: 'hot' })
    addTask({ id: 'r-2', title: 'Second', category: 'hot' })
    addTask({ id: 'r-3', title: 'Third', category: 'hot' })
  })

  it('should reorder within category', () => {
    // Current order: r-3 (smallest key), r-2, r-1 (largest key) -- newest first
    const result = reorderTask('r-1', 0) // Move r-1 to top
    expect(result).toBe(true)

    const tasks = getTasks()
      .filter((t) => t.category === 'hot')
      .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0))
    expect(tasks[0].id).toBe('r-1')
  })

  it('should only modify the moved task sortOrder', () => {
    const before = getTasks().filter((t) => t.category === 'hot')
    const r2Before = before.find((t) => t.id === 'r-2')!.sortOrder
    const r3Before = before.find((t) => t.id === 'r-3')!.sortOrder

    reorderTask('r-1', 0)

    const after = getTasks().filter((t) => t.category === 'hot')
    expect(after.find((t) => t.id === 'r-2')!.sortOrder).toBe(r2Before)
    expect(after.find((t) => t.id === 'r-3')!.sortOrder).toBe(r3Before)
  })

  it('should return false for non-existent task', () => {
    expect(reorderTask('nonexistent', 0)).toBe(false)
  })

  it('should return false for same position', () => {
    // r-3 is already at index 0
    expect(reorderTask('r-3', 0)).toBe(false)
  })

  it('should place reordered task between correct neighbors', () => {
    // r-3 (0), r-2 (1), r-1 (2)
    reorderTask('r-1', 1) // Move r-1 between r-3 and r-2

    const tasks = getTasks()
      .filter((t) => t.category === 'hot')
      .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0))
    expect(tasks[0].id).toBe('r-3')
    expect(tasks[1].id).toBe('r-1')
    expect(tasks[2].id).toBe('r-2')
  })
})

describe('deleteTask', () => {
  it('should soft-delete task (hidden from getTasks but in storage)', () => {
    addTask({ id: 'del-1', title: 'To delete', category: 'hot' })
    expect(getTasks()).toHaveLength(1)
    deleteTask('del-1')
    expect(getTasks()).toHaveLength(0)

    // Verify tombstone in persisted data
    const lastWrite = vi.mocked(writeJsonFile).mock.calls.at(-1)![1] as Array<Record<string, unknown>>
    const deleted = lastWrite.find((t) => t.id === 'del-1')
    expect(deleted).toBeDefined()
    expect(deleted!.deletedAt).toBeTypeOf('number')
  })

  it('should be a no-op for non-existent task', () => {
    addTask({ id: 'keep', title: 'Keep', category: 'hot' })
    deleteTask('nonexistent')
    expect(getTasks()).toHaveLength(1)
  })

  it('should reject duplicate ID even for soft-deleted task', () => {
    addTask({ id: 'del-1', title: 'Original', category: 'hot' })
    deleteTask('del-1')
    const result = addTask({ id: 'del-1', title: 'Reuse attempt', category: 'hot' })
    expect(result.success).toBe(false)
  })
})

describe('addProjectNote', () => {
  beforeEach(() => {
    addTask({ id: 'task-p', title: 'Timed Task', category: 'timed' })
  })

  it('should add note to task', () => {
    const result = addProjectNote({ id: 'note-1', taskId: 'task-p', content: 'A note' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('A note')
      expect(result.data.taskId).toBe('task-p')
    }
    const task = getTasks().find((t) => t.id === 'task-p')!
    expect(task.projectNotes).toHaveLength(1)
  })

  it('should reject empty content', () => {
    const result = addProjectNote({ id: 'note-1', taskId: 'task-p', content: '' })
    expect(result.success).toBe(false)
  })

  it('should reject non-existent task', () => {
    const result = addProjectNote({ id: 'note-1', taskId: 'nonexistent', content: 'Note' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('not found')
  })

  it('should reject soft-deleted task', () => {
    deleteTask('task-p')
    const result = addProjectNote({ id: 'note-1', taskId: 'task-p', content: 'Orphan attempt' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('not found')
  })
})

describe('updateProjectNote', () => {
  beforeEach(() => {
    addTask({ id: 'task-p', title: 'Timed Task', category: 'timed' })
    addProjectNote({ id: 'note-1', taskId: 'task-p', content: 'Original' })
  })

  it('should update content', () => {
    const result = updateProjectNote({ id: 'note-1', content: 'Updated' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data?.content).toBe('Updated')
  })

  it('should return null for non-existent note', () => {
    const result = updateProjectNote({ id: 'nonexistent', content: 'Test' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeNull()
  })

  it('should return null for soft-deleted note', () => {
    deleteProjectNote('note-1')
    const result = updateProjectNote({ id: 'note-1', content: 'Attempt' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeNull()
  })
})

describe('deleteProjectNote', () => {
  it('should soft-delete note (hidden from getTasks but in storage)', () => {
    addTask({ id: 'task-p', title: 'Timed Task', category: 'timed' })
    addProjectNote({ id: 'note-1', taskId: 'task-p', content: 'Delete me' })

    deleteProjectNote('note-1')
    const task = getTasks().find((t) => t.id === 'task-p')!
    expect(task.projectNotes?.length ?? 0).toBe(0)

    // Verify tombstone in persisted data
    const lastWrite = vi.mocked(writeJsonFile).mock.calls.at(-1)![1] as Array<Record<string, unknown>>
    const parentTask = lastWrite.find((t) => t.id === 'task-p') as Record<string, unknown>
    const notes = parentTask.projectNotes as Array<Record<string, unknown>>
    expect(notes).toHaveLength(1)
    expect(notes[0].deletedAt).toBeTypeOf('number')
  })
})

describe('sync helpers', () => {
  it('getAllTasksRaw should include soft-deleted tasks', () => {
    addTask({ id: 'active-1', title: 'Active', category: 'hot' })
    addTask({ id: 'deleted-1', title: 'Deleted', category: 'warm' })
    deleteTask('deleted-1')

    expect(getTasks()).toHaveLength(1)
    expect(getAllTasksRaw()).toHaveLength(2)
    expect(getAllTasksRaw().find((t) => t.id === 'deleted-1')?.deletedAt).toBeTypeOf('number')
  })

  it('getTaskById should find active and deleted tasks', () => {
    addTask({ id: 'task-find', title: 'Find Me', category: 'cool' })
    expect(getTaskById('task-find')).toBeDefined()
    expect(getTaskById('task-find')!.title).toBe('Find Me')

    deleteTask('task-find')
    expect(getTaskById('task-find')).toBeDefined()
    expect(getTaskById('task-find')!.deletedAt).toBeTypeOf('number')

    expect(getTaskById('nonexistent')).toBeUndefined()
  })

  it('replaceCache should overwrite cache and persist', () => {
    addTask({ id: 'old', title: 'Old Task', category: 'hot' })
    expect(getTasks()).toHaveLength(1)

    const newTasks = [
      {
        id: 'new-1',
        title: 'New Task 1',
        category: 'warm' as const,
        isDone: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sortOrder: 'a0',
      },
      {
        id: 'new-2',
        title: 'New Task 2',
        category: 'cool' as const,
        isDone: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sortOrder: 'a1',
      },
    ]
    replaceCache(newTasks)

    expect(getTasks()).toHaveLength(2)
    expect(getTasks()[0].id).toBe('new-1')
    expect(writeJsonFile).toHaveBeenCalled()
  })
})
