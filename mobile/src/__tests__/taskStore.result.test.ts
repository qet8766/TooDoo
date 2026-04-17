/**
 * Phase 4b: mobile taskStore Result<T> surface.
 * Happy path + validation failure prove the discriminated union contract.
 */
jest.mock('../data/persistence', () => ({
  readJson: jest.fn(async () => null),
  writeJson: jest.fn(async () => undefined),
}))

jest.mock('../data/sync', () => ({
  pushEntity: jest.fn(),
}))

import { useTaskStore } from '../stores/taskStore'

describe('taskStore Result<T> surface', () => {
  beforeEach(async () => {
    // Reset in-memory cache between tests
    useTaskStore.getState().replaceCache([])
  })

  it('addTask returns ok(task) on success', async () => {
    const res = await useTaskStore.getState().addTask({
      title: 'Buy milk',
      category: 'hot',
    })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.title).toBe('Buy milk')
      expect(res.data.category).toBe('hot')
      expect(res.data.id).toBeDefined()
    }
  })

  it('addTask returns fail(error) on empty title', async () => {
    const res = await useTaskStore.getState().addTask({
      title: '',
      category: 'hot',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(typeof res.error).toBe('string')
      expect(res.error.length).toBeGreaterThan(0)
    }
  })

  it('updateTask returns ok(null) when the task does not exist', async () => {
    const res = await useTaskStore.getState().updateTask({
      id: 'nonexistent',
      title: 'anything',
    })

    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBeNull()
  })

  it('addProjectNote returns fail when the parent task is missing', async () => {
    const res = await useTaskStore.getState().addProjectNote('no-such-task', 'note content')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/task/i)
  })
})
