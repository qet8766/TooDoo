/**
 * Phase 0 mobile smoke test. Confirms:
 *   - jest + @react-native/jest-preset runs
 *   - babel module-resolver resolves @shared/* from mobile tests
 *   - RTL-native renderHook works
 *   - useTaskSections correctly buckets and sorts tasks
 *
 * This test is intentionally narrow — it's a tripwire for the upcoming
 * refactor (Phases 1 & 4 touch shared types and mobile store), not a
 * coverage push. Broader mobile testing lands in Phase 4.
 */
import { renderHook } from '@testing-library/react-native'
import type { Task } from '@shared/types'

const fakeTasks: Task[] = []

jest.mock('../stores/taskStore', () => ({
  useTaskStore: (selector: (s: { tasks: Task[] }) => unknown) => selector({ tasks: fakeTasks }),
}))

import { useTaskSections } from '../hooks/useTaskSections'

const task = (overrides: Partial<Task> = {}): Task => ({
  id: overrides.id ?? 't',
  title: overrides.title ?? 'x',
  category: overrides.category ?? 'hot',
  sortOrder: overrides.sortOrder ?? 'a0',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  projectNotes: [],
  ...overrides,
})

describe('useTaskSections', () => {
  beforeEach(() => {
    fakeTasks.length = 0
  })

  it('buckets tasks by category', () => {
    fakeTasks.push(
      task({ id: 'h1', category: 'hot' }),
      task({ id: 'w1', category: 'warm' }),
      task({ id: 't1', category: 'timed', scheduledDate: 1_700_000_000_000 }),
    )

    const { result } = renderHook(() => useTaskSections())

    expect(result.current.sections.hot.map((t) => t.id)).toEqual(['h1'])
    expect(result.current.sections.warm.map((t) => t.id)).toEqual(['w1'])
    expect(result.current.sections.timed.map((t) => t.id)).toEqual(['t1'])
    expect(result.current.sections.cool).toEqual([])
    expect(result.current.isScorchingMode).toBe(false)
  })

  it('sorts heat categories by fractional sortOrder (string compare)', () => {
    fakeTasks.push(
      task({ id: 'b', category: 'hot', sortOrder: 'a2' }),
      task({ id: 'a', category: 'hot', sortOrder: 'a0' }),
      task({ id: 'c', category: 'hot', sortOrder: 'a1' }),
    )

    const { result } = renderHook(() => useTaskSections())
    expect(result.current.sections.hot.map((t) => t.id)).toEqual(['a', 'c', 'b'])
  })

  it('sorts timed by scheduledDate ascending, unscheduled last', () => {
    const base = 1_700_000_000_000
    fakeTasks.push(
      task({ id: 'later', category: 'timed', scheduledDate: base + 2 * 86400000 }),
      task({ id: 'no-date', category: 'timed' }),
      task({ id: 'soon', category: 'timed', scheduledDate: base + 86400000 }),
    )

    const { result } = renderHook(() => useTaskSections())
    expect(result.current.sections.timed.map((t) => t.id)).toEqual(['soon', 'later', 'no-date'])
  })

  it('collapses visibleCategories to [scorching, timed] in scorching mode', () => {
    fakeTasks.push(task({ id: 's1', category: 'scorching' }))

    const { result } = renderHook(() => useTaskSections())
    expect(result.current.isScorchingMode).toBe(true)
    expect(result.current.visibleCategories.map((c) => c.key)).toEqual(['scorching', 'timed'])
  })

  it('filters out soft-deleted tasks', () => {
    fakeTasks.push(task({ id: 'alive', category: 'hot' }), task({ id: 'ghost', category: 'hot', deletedAt: 1 }))
    const { result } = renderHook(() => useTaskSections())
    expect(result.current.sections.hot.map((t) => t.id)).toEqual(['alive'])
  })
})
