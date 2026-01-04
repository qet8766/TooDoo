/**
 * Test fixtures for Task-related tests
 */

import type { Task, ProjectNote, TaskCategory } from '@shared/types'

/**
 * Creates a task with default values that can be overridden
 */
export const createTask = (overrides: Partial<Task> = {}): Task => {
  const now = Date.now()
  return {
    id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Task',
    category: 'hot' as TaskCategory,
    isDone: false,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...overrides,
  }
}

/**
 * Creates a project note with default values
 */
export const createProjectNote = (taskId: string, overrides: Partial<ProjectNote> = {}): ProjectNote => {
  const now = Date.now()
  return {
    id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
    taskId,
    content: 'Test note content',
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...overrides,
  }
}

/**
 * Sample tasks for testing different scenarios
 */
export const sampleTasks = {
  hot: createTask({ id: 'hot-1', title: 'Hot task', category: 'hot' }),
  warm: createTask({ id: 'warm-1', title: 'Warm task', category: 'warm' }),
  cool: createTask({ id: 'cool-1', title: 'Cool task', category: 'cool' }),
  project: createTask({
    id: 'project-1',
    title: 'Project task',
    category: 'project',
    projectNotes: [
      createProjectNote('project-1', { id: 'note-1', content: 'First note' }),
      createProjectNote('project-1', { id: 'note-2', content: 'Second note' }),
    ],
  }),
  scorching: createTask({ id: 'scorching-1', title: 'Scorching task', category: 'scorching' }),
  completed: createTask({ id: 'done-1', title: 'Completed task', isDone: true }),
  deleted: createTask({ id: 'deleted-1', title: 'Deleted task', isDeleted: true }),
  withDescription: createTask({
    id: 'desc-1',
    title: 'Task with description',
    description: 'This is a detailed description of the task.',
  }),
  longTitle: createTask({
    id: 'long-1',
    title: 'A'.repeat(100), // 100 character title
  }),
}

/**
 * Creates a full set of tasks for category display testing
 */
export const createCategoryTestSet = (): Task[] => [
  createTask({ id: 'cat-hot-1', title: 'Hot 1', category: 'hot' }),
  createTask({ id: 'cat-hot-2', title: 'Hot 2', category: 'hot' }),
  createTask({ id: 'cat-warm-1', title: 'Warm 1', category: 'warm' }),
  createTask({ id: 'cat-cool-1', title: 'Cool 1', category: 'cool' }),
  createTask({ id: 'cat-cool-2', title: 'Cool 2', category: 'cool' }),
  createTask({ id: 'cat-cool-3', title: 'Cool 3', category: 'cool' }),
  createTask({
    id: 'cat-project-1',
    title: 'Project 1',
    category: 'project',
    projectNotes: [createProjectNote('cat-project-1', { content: 'Project note' })],
  }),
]

/**
 * Edge case tasks for validation testing
 */
export const edgeCaseTasks = {
  emptyTitle: { id: 'edge-1', title: '', category: 'hot' as TaskCategory },
  whitespaceTitle: { id: 'edge-2', title: '   ', category: 'hot' as TaskCategory },
  veryLongTitle: { id: 'edge-3', title: 'X'.repeat(600), category: 'hot' as TaskCategory },
  veryLongDescription: { id: 'edge-4', title: 'Test', description: 'Y'.repeat(6000), category: 'hot' as TaskCategory },
  specialChars: { id: 'edge-5', title: '<script>alert("xss")</script>', category: 'hot' as TaskCategory },
  unicodeTitle: { id: 'edge-6', title: 'Task with emojis and unicode chars', category: 'hot' as TaskCategory },
  invalidCategory: { id: 'edge-7', title: 'Invalid', category: 'invalid' as TaskCategory },
}

/**
 * Legacy category tasks for migration testing
 */
export const legacyTasks = [
  { ...createTask({ id: 'legacy-1', title: 'Legacy immediate' }), category: 'immediate' as unknown as TaskCategory },
  { ...createTask({ id: 'legacy-2', title: 'Legacy short term' }), category: 'short_term' as unknown as TaskCategory },
  { ...createTask({ id: 'legacy-3', title: 'Legacy long term' }), category: 'long_term' as unknown as TaskCategory },
]
