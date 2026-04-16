/**
 * Database → pushEntity Integration Tests
 *
 * Verifies that mutations in database.ts correctly trigger
 * pushEntity with the right entity type and data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPushEntity } = vi.hoisted(() => {
  const mockPushEntity = vi.fn()
  return { mockPushEntity }
})

vi.mock('../../src/main/db/sync/sync', () => ({
  pushEntity: mockPushEntity,
}))

vi.mock('../../src/main/db/store', () => ({
  readJsonFile: vi.fn(() => null),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}))

vi.mock('../../src/main/broadcast', () => ({
  broadcast: vi.fn(),
  broadcastTaskChange: vi.fn(),
  broadcastNotesChange: vi.fn(),
}))

vi.mock('../../src/main/electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    on: vi.fn(),
  },
  net: {
    isOnline: vi.fn(() => true),
  },
}))

vi.mock('../../src/main/db/tasks', () => ({
  init: vi.fn(),
  getTasks: vi.fn(() => []),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(),
  getAllTasksRaw: vi.fn(() => []),
  reorderTask: vi.fn(),
  addProjectNote: vi.fn(),
  updateProjectNote: vi.fn(),
  deleteProjectNote: vi.fn(),
  replaceCache: vi.fn(),
}))

vi.mock('../../src/main/db/notes', () => ({
  init: vi.fn(),
  getNotes: vi.fn(() => []),
  addNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  getNoteById: vi.fn(),
  getAllNotesRaw: vi.fn(() => []),
  replaceCache: vi.fn(),
}))

import * as taskOps from '@main/db/tasks'
import * as noteOps from '@main/db/notes'
import {
  addTask,
  updateTask,
  deleteTask,
  reorderTask,
  addProjectNote,
  updateProjectNote,
  deleteProjectNote,
  addNote,
  updateNote,
  deleteNote,
} from '@main/db/database'
import type { Task, ProjectNote, Note } from '@shared/types'

const taskFixture: Task = {
  id: 'task-1',
  title: 'Test Task',
  category: 'hot',
  isDone: false,
  createdAt: 1000,
  updatedAt: 2000,
  sortOrder: 'a0',
}

const projectNoteFixture: ProjectNote = {
  id: 'pn-1',
  taskId: 'task-1',
  content: 'Test note',
  createdAt: 1000,
  updatedAt: 2000,
}

const noteFixture: Note = {
  id: 'note-1',
  title: 'Test Note',
  content: 'Content',
  createdAt: 1000,
  updatedAt: 2000,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addTask', () => {
  it('should call pushEntity with task on success', async () => {
    vi.mocked(taskOps.addTask).mockReturnValue({ success: true, data: taskFixture })

    await addTask({ id: 'task-1', title: 'Test Task', category: 'hot' })

    expect(mockPushEntity).toHaveBeenCalledOnce()
    expect(mockPushEntity).toHaveBeenCalledWith('task', taskFixture)
  })

  it('should NOT call pushEntity on failure', async () => {
    vi.mocked(taskOps.addTask).mockReturnValue({ success: false, error: 'Validation error' })

    await addTask({ id: 'bad', title: '', category: 'hot' })

    expect(mockPushEntity).not.toHaveBeenCalled()
  })
})

describe('updateTask', () => {
  it('should call pushEntity with updated task on success', async () => {
    const updated = { ...taskFixture, title: 'Updated', updatedAt: 3000 }
    vi.mocked(taskOps.updateTask).mockReturnValue({ success: true, data: updated })

    await updateTask({ id: 'task-1', title: 'Updated' })

    expect(mockPushEntity).toHaveBeenCalledWith('task', updated)
  })

  it('should NOT call pushEntity when task not found', async () => {
    vi.mocked(taskOps.updateTask).mockReturnValue({ success: true, data: null })

    await updateTask({ id: 'missing', title: 'X' })

    expect(mockPushEntity).not.toHaveBeenCalled()
  })
})

describe('deleteTask', () => {
  it('should call pushEntity with task that has deletedAt', async () => {
    const deletedTask = { ...taskFixture, deletedAt: 9999, updatedAt: 9999 }
    vi.mocked(taskOps.deleteTask).mockImplementation(() => {})
    vi.mocked(taskOps.getTaskById).mockReturnValue(deletedTask)

    await deleteTask('task-1')

    expect(mockPushEntity).toHaveBeenCalledWith('task', expect.objectContaining({ deletedAt: 9999 }))
  })

  it('should NOT call pushEntity when task not found after delete', async () => {
    vi.mocked(taskOps.deleteTask).mockImplementation(() => {})
    vi.mocked(taskOps.getTaskById).mockReturnValue(undefined)

    await deleteTask('missing')

    expect(mockPushEntity).not.toHaveBeenCalled()
  })
})

describe('reorderTask', () => {
  it('should call pushEntity with reordered task on success', async () => {
    vi.mocked(taskOps.reorderTask).mockReturnValue(true)
    vi.mocked(taskOps.getTaskById).mockReturnValue({ ...taskFixture, sortOrder: 'b0' })

    await reorderTask('task-1', 2)

    expect(mockPushEntity).toHaveBeenCalledWith('task', expect.objectContaining({ sortOrder: 'b0' }))
  })
})

describe('addProjectNote', () => {
  it('should call pushEntity for BOTH the note AND parent task', async () => {
    vi.mocked(taskOps.addProjectNote).mockReturnValue({ success: true, data: projectNoteFixture })
    vi.mocked(taskOps.getTaskById).mockReturnValue(taskFixture)

    await addProjectNote({ id: 'pn-1', taskId: 'task-1', content: 'Test note' })

    expect(mockPushEntity).toHaveBeenCalledTimes(2)
    expect(mockPushEntity).toHaveBeenCalledWith('projectNote', projectNoteFixture)
    expect(mockPushEntity).toHaveBeenCalledWith('task', taskFixture)
  })

  it('should NOT call pushEntity on failure', async () => {
    vi.mocked(taskOps.addProjectNote).mockReturnValue({ success: false, error: 'Task not found' })

    await addProjectNote({ id: 'pn-1', taskId: 'missing', content: 'Note' })

    expect(mockPushEntity).not.toHaveBeenCalled()
  })
})

describe('updateProjectNote', () => {
  it('should call pushEntity for both note and parent task on success', async () => {
    const updatedNote = { ...projectNoteFixture, content: 'Updated', updatedAt: 3000 }
    vi.mocked(taskOps.updateProjectNote).mockReturnValue({ success: true, data: updatedNote })
    vi.mocked(taskOps.getTaskById).mockReturnValue(taskFixture)

    await updateProjectNote({ id: 'pn-1', content: 'Updated' })

    expect(mockPushEntity).toHaveBeenCalledTimes(2)
    expect(mockPushEntity).toHaveBeenCalledWith('projectNote', updatedNote)
    expect(mockPushEntity).toHaveBeenCalledWith('task', taskFixture)
  })
})

describe('deleteProjectNote', () => {
  it('should call pushEntity for both deleted note and parent task', async () => {
    const deletedNote: ProjectNote = { ...projectNoteFixture, deletedAt: 9999, updatedAt: 9999 }
    const parentTask: Task = { ...taskFixture, projectNotes: [deletedNote] }

    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([{ ...taskFixture, projectNotes: [projectNoteFixture] }])
    vi.mocked(taskOps.deleteProjectNote).mockImplementation(() => {})
    vi.mocked(taskOps.getTaskById).mockReturnValue(parentTask)

    await deleteProjectNote('pn-1')

    expect(mockPushEntity).toHaveBeenCalledWith('task', parentTask)
    expect(mockPushEntity).toHaveBeenCalledWith('projectNote', deletedNote)
  })

  it('should NOT call pushEntity when note not found', async () => {
    vi.mocked(taskOps.getAllTasksRaw).mockReturnValue([])
    vi.mocked(taskOps.deleteProjectNote).mockImplementation(() => {})

    await deleteProjectNote('nonexistent')

    expect(mockPushEntity).not.toHaveBeenCalled()
  })
})

describe('addNote', () => {
  it('should call pushEntity with note on success', async () => {
    vi.mocked(noteOps.addNote).mockReturnValue({ success: true, data: noteFixture })

    await addNote({ id: 'note-1', title: 'Test Note', content: 'Content' })

    expect(mockPushEntity).toHaveBeenCalledWith('note', noteFixture)
  })
})

describe('updateNote', () => {
  it('should call pushEntity with updated note on success', async () => {
    const updated = { ...noteFixture, title: 'Updated', updatedAt: 3000 }
    vi.mocked(noteOps.updateNote).mockReturnValue({ success: true, data: updated })

    await updateNote({ id: 'note-1', title: 'Updated' })

    expect(mockPushEntity).toHaveBeenCalledWith('note', updated)
  })
})

describe('deleteNote', () => {
  it('should call pushEntity with note that has deletedAt', async () => {
    const deletedNote = { ...noteFixture, deletedAt: 9999, updatedAt: 9999 }
    vi.mocked(noteOps.deleteNote).mockImplementation(() => {})
    vi.mocked(noteOps.getNoteById).mockReturnValue(deletedNote)

    await deleteNote('note-1')

    expect(mockPushEntity).toHaveBeenCalledWith('note', expect.objectContaining({ deletedAt: 9999 }))
  })
})
