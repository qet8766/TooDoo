/**
 * Phase 4a: taskInteractionStore behavioral coverage.
 * Covers the arm/confirm cycle, auto-disarm timer, and disarmAll cleanup.
 */
import { useTaskInteractionStore } from '../stores/taskInteractionStore'

describe('taskInteractionStore', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    useTaskInteractionStore.getState().disarmAll()
    useTaskInteractionStore.getState().cancelEdit()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('armOrConfirmTask: first press arms, second press confirms', () => {
    const { armOrConfirmTask } = useTaskInteractionStore.getState()

    expect(armOrConfirmTask('t1')).toBe(false)
    expect(useTaskInteractionStore.getState().armedTasks.has('t1')).toBe(true)

    expect(armOrConfirmTask('t1')).toBe(true)
    expect(useTaskInteractionStore.getState().armedTasks.has('t1')).toBe(false)
  })

  it('armOrConfirmTask: auto-disarms after 2s', () => {
    const { armOrConfirmTask } = useTaskInteractionStore.getState()

    armOrConfirmTask('t1')
    expect(useTaskInteractionStore.getState().armedTasks.has('t1')).toBe(true)

    jest.advanceTimersByTime(2000)
    expect(useTaskInteractionStore.getState().armedTasks.has('t1')).toBe(false)
  })

  it('armOrConfirmNote: independent set from tasks', () => {
    const { armOrConfirmTask, armOrConfirmNote } = useTaskInteractionStore.getState()

    armOrConfirmTask('shared-id')
    armOrConfirmNote('shared-id')

    const { armedTasks, armedNotes } = useTaskInteractionStore.getState()
    expect(armedTasks.has('shared-id')).toBe(true)
    expect(armedNotes.has('shared-id')).toBe(true)

    expect(armOrConfirmTask('shared-id')).toBe(true)
    expect(useTaskInteractionStore.getState().armedTasks.has('shared-id')).toBe(false)
    expect(useTaskInteractionStore.getState().armedNotes.has('shared-id')).toBe(true)
  })

  it('disarmAll: clears both sets and cancels pending timers', () => {
    const { armOrConfirmTask, armOrConfirmNote, disarmAll } = useTaskInteractionStore.getState()

    armOrConfirmTask('t1')
    armOrConfirmTask('t2')
    armOrConfirmNote('n1')

    disarmAll()
    expect(useTaskInteractionStore.getState().armedTasks.size).toBe(0)
    expect(useTaskInteractionStore.getState().armedNotes.size).toBe(0)

    // Timers from the earlier arms must not re-introduce IDs into the sets.
    jest.advanceTimersByTime(2000)
    expect(useTaskInteractionStore.getState().armedTasks.size).toBe(0)
    expect(useTaskInteractionStore.getState().armedNotes.size).toBe(0)
  })

  it('startEdit / updateForm / cancelEdit flow', () => {
    const { startEdit, updateForm, cancelEdit } = useTaskInteractionStore.getState()

    startEdit('t1', { title: 'a', description: '', scheduledDate: null, scheduledTime: '' })
    expect(useTaskInteractionStore.getState().editingTaskId).toBe('t1')
    expect(useTaskInteractionStore.getState().editForm?.title).toBe('a')

    updateForm({ title: 'b', description: 'x', scheduledDate: null, scheduledTime: '' })
    expect(useTaskInteractionStore.getState().editForm?.title).toBe('b')
    expect(useTaskInteractionStore.getState().editForm?.description).toBe('x')

    cancelEdit()
    expect(useTaskInteractionStore.getState().editingTaskId).toBeNull()
    expect(useTaskInteractionStore.getState().editForm).toBeNull()
  })
})
