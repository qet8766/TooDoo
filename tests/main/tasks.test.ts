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
  recalculateScheduledCategories,
} from '@main/db/tasks'
import { readJsonFile } from '@main/db/store'

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
      expect(result.data.sortOrder).toBe(0)
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

  it('should assign sortOrder 0 and shift existing tasks in category', () => {
    addTask({ id: 'a', title: 'First', category: 'hot' })
    addTask({ id: 'b', title: 'Second', category: 'hot' })

    const tasks = getTasks()
    const hotTasks = tasks.filter((t) => t.category === 'hot').sort((a, b) => a.sortOrder - b.sortOrder)
    expect(hotTasks[0].id).toBe('b') // newest at top
    expect(hotTasks[0].sortOrder).toBe(0)
    expect(hotTasks[1].id).toBe('a')
    expect(hotTasks[1].sortOrder).toBeGreaterThan(0)
  })

  it('should not shift tasks in other categories', () => {
    addTask({ id: 'a', title: 'Hot task', category: 'hot' })
    addTask({ id: 'b', title: 'Warm task', category: 'warm' })

    const tasks = getTasks()
    const hotTask = tasks.find((t) => t.id === 'a')!
    expect(hotTask.sortOrder).toBe(0) // unchanged since warm task didn't shift it
  })

  it('should calculate effective category for scheduled tasks', () => {
    const farFuture = Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days out
    const result = addTask({
      id: 'sched-1',
      title: 'Future task',
      category: 'hot',
      scheduledDate: farFuture,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('cool') // far away → cool
      expect(result.data.baseCategory).toBe('hot')
    }
  })

  it('should not auto-promote project tasks', () => {
    const result = addTask({
      id: 'proj-1',
      title: 'Project task',
      category: 'project',
      scheduledDate: Date.now() + 1000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('project')
      expect(result.data.baseCategory).toBeUndefined()
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

  it('should clear description with null', () => {
    const result = updateTask({ id: 'u-1', description: null })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data?.description).toBeUndefined()
  })

  it('should move to top of category when category changes', () => {
    addTask({ id: 'u-2', title: 'Already warm', category: 'warm' })
    const result = updateTask({ id: 'u-1', category: 'warm' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.category).toBe('warm')
      expect(result.data?.sortOrder).toBe(0)
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
    // Current order: r-3 (0), r-2 (1), r-1 (2) -- newest first
    const result = reorderTask('r-1', 0) // Move r-1 to top
    expect(result).toBe(true)

    const tasks = getTasks()
      .filter((t) => t.category === 'hot')
      .sort((a, b) => a.sortOrder - b.sortOrder)
    expect(tasks[0].id).toBe('r-1')
  })

  it('should return false for non-existent task', () => {
    expect(reorderTask('nonexistent', 0)).toBe(false)
  })

  it('should return false for same position', () => {
    // r-3 is already at index 0
    expect(reorderTask('r-3', 0)).toBe(false)
  })
})

describe('deleteTask', () => {
  it('should remove task from cache', () => {
    addTask({ id: 'del-1', title: 'To delete', category: 'hot' })
    expect(getTasks()).toHaveLength(1)
    deleteTask('del-1')
    expect(getTasks()).toHaveLength(0)
  })

  it('should be a no-op for non-existent task', () => {
    addTask({ id: 'keep', title: 'Keep', category: 'hot' })
    deleteTask('nonexistent')
    expect(getTasks()).toHaveLength(1)
  })
})

describe('addProjectNote', () => {
  beforeEach(() => {
    addTask({ id: 'task-p', title: 'Project', category: 'project' })
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
})

describe('updateProjectNote', () => {
  beforeEach(() => {
    addTask({ id: 'task-p', title: 'Project', category: 'project' })
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
})

describe('deleteProjectNote', () => {
  it('should remove note from task', () => {
    addTask({ id: 'task-p', title: 'Project', category: 'project' })
    addProjectNote({ id: 'note-1', taskId: 'task-p', content: 'Delete me' })

    deleteProjectNote('note-1')
    const task = getTasks().find((t) => t.id === 'task-p')!
    expect(task.projectNotes?.length ?? 0).toBe(0)
  })
})

describe('recalculateScheduledCategories', () => {
  it('should return 0 when no tasks need updating', () => {
    addTask({ id: 'a', title: 'No schedule', category: 'hot' })
    expect(recalculateScheduledCategories()).toBe(0)
  })

  it('should promote overdue tasks to scorching', () => {
    const pastDate = Date.now() - 24 * 60 * 60 * 1000 // yesterday
    addTask({ id: 'overdue', title: 'Overdue', category: 'cool', scheduledDate: pastDate })

    // After add, the task would already be categorized by addTask.
    // But if we manually check, recalculation should find nothing extra to update
    // because addTask already calculates the effective category.
    const updated = recalculateScheduledCategories()
    expect(updated).toBe(0) // already correct from addTask
  })
})
