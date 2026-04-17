import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { generateKeyBetween } from 'fractional-indexing'
import type { Task, TaskCategory, ProjectNote } from '@shared/types'
import { validateTaskFields, validateProjectNoteFields, sanitizeTasks } from '@shared/validation'
import { readJson, writeJson } from '../data/persistence'
import { createQueue } from '../data/queue'
import { pushEntity } from '../data/sync'

const TASKS_KEY = '@toodoo/tasks'

const queue = createQueue()

// --- Helpers (same logic as Electron tasks.ts) ---

const activeCategoryTasks = (tasks: Task[], category: TaskCategory): Task[] =>
  tasks
    .filter((t) => t.category === category && !t.deletedAt)
    .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0))

const firstSortKey = (tasks: Task[], category: TaskCategory): string | null => {
  const sorted = activeCategoryTasks(tasks, category)
  return sorted.length > 0 ? sorted[0].sortOrder : null
}

// --- Store ---

type TaskState = {
  tasks: Task[]
}

type TaskActions = {
  init: () => Promise<void>
  addTask: (p: {
    title: string
    description?: string
    category: TaskCategory
    scheduledDate?: number
    scheduledTime?: string
  }) => Promise<Task | null>
  updateTask: (p: {
    id: string
    title?: string
    description?: string | null
    isDone?: boolean
    category?: TaskCategory
    scheduledDate?: number | null
    scheduledTime?: string | null
  }) => Promise<Task | null>
  reorderTask: (taskId: string, targetIndex: number) => Promise<boolean>
  deleteTask: (id: string) => Promise<void>
  addProjectNote: (taskId: string, content: string) => Promise<ProjectNote | null>
  updateProjectNote: (noteId: string, content: string) => Promise<ProjectNote | null>
  deleteProjectNote: (noteId: string) => Promise<void>
  // Sync helpers
  getAllTasksRaw: () => Task[]
  replaceCache: (tasks: Task[]) => void
  getEnqueue: () => <T>(fn: () => T) => Promise<T>
}

export const useTaskStore = create<TaskState & TaskActions>((set, get) => {
  const persist = () => {
    writeJson(TASKS_KEY, get().tasks)
  }

  return {
    tasks: [],

    init: async () => {
      const raw = await readJson(TASKS_KEY)
      const tasks = sanitizeTasks(raw)
      set({ tasks })
    },

    addTask: (p) =>
      queue.enqueue(() => {
        const fieldRes = validateTaskFields(p)
        if (!fieldRes.success) {
          console.warn('addTask validation:', fieldRes.error)
          return null
        }

        const { tasks } = get()
        const id = uuid()
        const now = Date.now()
        const sortKey = generateKeyBetween(null, firstSortKey(tasks, p.category))

        const task: Task = {
          id,
          title: p.title.trim(),
          description: p.description?.trim(),
          category: p.category,
          scheduledDate: p.scheduledDate,
          scheduledTime: p.scheduledTime,
          isDone: false,
          createdAt: now,
          updatedAt: now,
          sortOrder: sortKey,
        }

        set({ tasks: [task, ...tasks] })
        persist()
        pushEntity('task', task)
        return task
      }),

    updateTask: (p) =>
      queue.enqueue(() => {
        const fieldRes = validateTaskFields(p)
        if (!fieldRes.success) {
          console.warn('updateTask validation:', fieldRes.error)
          return null
        }

        const { tasks } = get()
        const existing = tasks.find((t) => t.id === p.id)
        if (!existing || existing.deletedAt) return null

        const now = Date.now()
        const newCategory = p.category ?? existing.category
        const categoryChanged = newCategory !== existing.category

        const updated: Task = {
          ...existing,
          title: p.title !== undefined ? p.title.trim() : existing.title,
          description: p.description === null ? undefined : (p.description?.trim() ?? existing.description),
          category: newCategory,
          scheduledDate:
            p.scheduledDate === null ? undefined : (p.scheduledDate ?? existing.scheduledDate),
          scheduledTime:
            p.scheduledTime === null ? undefined : (p.scheduledTime ?? existing.scheduledTime),
          isDone: p.isDone ?? existing.isDone,
          updatedAt: now,
          sortOrder: categoryChanged ? generateKeyBetween(null, firstSortKey(tasks, newCategory)) : existing.sortOrder,
        }

        set({ tasks: tasks.map((t) => (t.id === p.id ? updated : t)) })
        persist()
        pushEntity('task', updated)
        return updated
      }),

    reorderTask: (taskId, targetIndex) =>
      queue.enqueue(() => {
        const { tasks } = get()
        const task = tasks.find((t) => t.id === taskId && !t.deletedAt)
        if (!task) return false

        const sorted = activeCategoryTasks(tasks, task.category)
        const currentIndex = sorted.findIndex((t) => t.id === taskId)
        if (currentIndex === -1 || currentIndex === targetIndex) return false

        const withoutCurrent = sorted.filter((t) => t.id !== taskId)
        const before = targetIndex > 0 ? withoutCurrent[targetIndex - 1].sortOrder : null
        const after = targetIndex < withoutCurrent.length ? withoutCurrent[targetIndex].sortOrder : null
        const newKey = generateKeyBetween(before, after)

        const now = Date.now()
        const updated = tasks.map((t) => (t.id === taskId ? { ...t, sortOrder: newKey, updatedAt: now } : t))
        set({ tasks: updated })
        persist()

        const updatedTask = updated.find((t) => t.id === taskId)!
        pushEntity('task', updatedTask)
        return true
      }),

    deleteTask: (id) =>
      queue.enqueue(() => {
        const { tasks } = get()
        const now = Date.now()
        const updated = tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t))
        set({ tasks: updated })
        persist()

        const deletedTask = updated.find((t) => t.id === id)
        if (deletedTask) pushEntity('task', deletedTask)
      }),

    addProjectNote: (taskId, content) =>
      queue.enqueue(() => {
        const fieldRes = validateProjectNoteFields({ content })
        if (!fieldRes.success) {
          console.warn('addProjectNote validation:', fieldRes.error)
          return null
        }

        const { tasks } = get()
        const task = tasks.find((t) => t.id === taskId)
        if (!task || task.deletedAt) return null

        const now = Date.now()
        const note: ProjectNote = {
          id: uuid(),
          taskId,
          content: content.trim(),
          createdAt: now,
          updatedAt: now,
        }

        const updatedTask: Task = {
          ...task,
          projectNotes: [...(task.projectNotes || []), note],
          updatedAt: now,
        }

        set({ tasks: tasks.map((t) => (t.id === taskId ? updatedTask : t)) })
        persist()
        pushEntity('projectNote', note)
        pushEntity('task', updatedTask)
        return note
      }),

    updateProjectNote: (noteId, content) =>
      queue.enqueue(() => {
        const fieldRes = validateProjectNoteFields({ content })
        if (!fieldRes.success) {
          console.warn('updateProjectNote validation:', fieldRes.error)
          return null
        }

        const { tasks } = get()
        let foundTask: Task | undefined
        let foundNote: ProjectNote | undefined

        for (const t of tasks) {
          const n = t.projectNotes?.find((pn) => pn.id === noteId)
          if (n) {
            foundTask = t
            foundNote = n
            break
          }
        }

        if (!foundTask || !foundNote || foundNote.deletedAt) return null

        const now = Date.now()
        const updatedNote: ProjectNote = { ...foundNote, content: content.trim(), updatedAt: now }
        const updatedTask: Task = {
          ...foundTask,
          projectNotes: (foundTask.projectNotes ?? []).map((n) => (n.id === noteId ? updatedNote : n)),
          updatedAt: now,
        }

        set({ tasks: tasks.map((t) => (t.id === foundTask!.id ? updatedTask : t)) })
        persist()
        pushEntity('projectNote', updatedNote)
        pushEntity('task', updatedTask)
        return updatedNote
      }),

    deleteProjectNote: (noteId) =>
      queue.enqueue(() => {
        const { tasks } = get()
        let foundTask: Task | undefined

        for (const t of tasks) {
          if (t.projectNotes?.some((n) => n.id === noteId)) {
            foundTask = t
            break
          }
        }
        if (!foundTask) return

        const now = Date.now()
        const updatedTask: Task = {
          ...foundTask,
          projectNotes: foundTask.projectNotes?.map((n) =>
            n.id === noteId ? { ...n, deletedAt: now, updatedAt: now } : n,
          ),
          updatedAt: now,
        }

        set({ tasks: tasks.map((t) => (t.id === foundTask!.id ? updatedTask : t)) })
        persist()

        const deletedNote = updatedTask.projectNotes?.find((n) => n.id === noteId)
        if (deletedNote) pushEntity('projectNote', deletedNote)
        pushEntity('task', updatedTask)
      }),

    // Sync helpers — used by sync.ts
    getAllTasksRaw: () => [...get().tasks],
    replaceCache: (tasks) => {
      set({ tasks })
      persist()
    },
    getEnqueue: () => queue.enqueue,
  }
})
