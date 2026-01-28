import {
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import type { Note, ProjectNote, Task, TaskCategory } from '@shared/types'
import { ALL_CATEGORIES } from '@shared/categories'
import { calculateEffectiveCategory, getTasksNeedingUpdate } from '@shared/category-calculator'
import { initFirebase, getTasksCollection, getNotesCollection } from './firebase'
import { broadcastTaskChange, broadcastNotesChange } from '../broadcast'

// --- Constants ---

const MAX_PAYLOAD_SIZE = 100_000

// --- In-Memory Cache ---
// Firestore listeners populate these caches; CRUD operations update both cache and Firestore

let tasksCache: Task[] = []
let notesCache: Note[] = []

// --- Firestore Listeners ---

let tasksUnsubscribe: Unsubscribe | null = null
let notesUnsubscribe: Unsubscribe | null = null

/**
 * Start real-time listeners for tasks and notes collections.
 * Updates are broadcast to all renderer windows.
 */
const startListeners = () => {
  // Tasks listener
  tasksUnsubscribe = onSnapshot(
    getTasksCollection(),
    (snapshot) => {
      tasksCache = snapshot.docs.map((doc) => doc.data() as Task)
      console.log(`Firestore tasks updated: ${tasksCache.length} tasks`)
      broadcastTaskChange()
    },
    (error) => {
      console.error('Firestore tasks listener error:', error)
    }
  )

  // Notes listener
  notesUnsubscribe = onSnapshot(
    getNotesCollection(),
    (snapshot) => {
      notesCache = snapshot.docs.map((doc) => doc.data() as Note)
      console.log(`Firestore notes updated: ${notesCache.length} notes`)
      broadcastNotesChange()
    },
    (error) => {
      console.error('Firestore notes listener error:', error)
    }
  )
}

/**
 * Stop all Firestore listeners. Called on app shutdown.
 */
export const stopListeners = () => {
  if (tasksUnsubscribe) {
    tasksUnsubscribe()
    tasksUnsubscribe = null
  }
  if (notesUnsubscribe) {
    notesUnsubscribe()
    notesUnsubscribe = null
  }
}

// --- Database Initialization ---

/**
 * Initialize the database: connect to Firebase, load initial data, start listeners.
 */
export const initDatabase = async (): Promise<void> => {
  await initFirebase()

  // Load initial data
  const [tasksSnapshot, notesSnapshot] = await Promise.all([
    getDocs(getTasksCollection()),
    getDocs(getNotesCollection()),
  ])

  tasksCache = tasksSnapshot.docs.map((doc) => doc.data() as Task)
  notesCache = notesSnapshot.docs.map((doc) => doc.data() as Note)

  console.log(`Database initialized: ${tasksCache.length} tasks, ${notesCache.length} notes`)

  // Start real-time listeners
  startListeners()
}

// --- Validation ---

const validate = (rules: [boolean, string][]): string | null =>
  rules.find(([fail]) => fail)?.[1] ?? null

const validateTask = (p: {
  title?: string
  description?: string | null
  category?: TaskCategory
}): string | null =>
  validate([
    [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
    [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
    [typeof p.title === 'string' && p.title.length > 500, 'Title too long'],
    [p.description != null && typeof p.description !== 'string', 'Description must be a string'],
    [typeof p.description === 'string' && p.description.length > 5000, 'Description too long'],
    [p.category !== undefined && !ALL_CATEGORIES.includes(p.category), 'Invalid category'],
    [JSON.stringify(p).length > MAX_PAYLOAD_SIZE, 'Payload too large'],
  ])

const validateProjectNote = (p: { content: string }): string | null =>
  validate([
    [typeof p.content !== 'string', 'Content must be a string'],
    [!p.content.trim(), 'Content cannot be empty'],
    [p.content.length > 10000, 'Content too long'],
  ])

const validateNotetankNote = (p: { title?: string; content?: string }): string | null =>
  validate([
    [p.title !== undefined && typeof p.title !== 'string', 'Title must be a string'],
    [typeof p.title === 'string' && !p.title.trim(), 'Title cannot be empty'],
    [typeof p.title === 'string' && p.title.length > 200, 'Title too long'],
    [p.content !== undefined && typeof p.content !== 'string', 'Content must be a string'],
    [typeof p.content === 'string' && p.content.length > 50000, 'Content too long'],
  ])

// --- Tasks ---

export const getTasks = async (): Promise<Task[]> => {
  return tasksCache
}

export const addTask = async (p: {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone?: boolean
  scheduledDate?: number
  scheduledTime?: string
}): Promise<Task | { error: string }> => {
  const err = validateTask(p)
  if (err) return { error: err }

  const now = Date.now()

  // Calculate effective category for scheduled tasks (project tasks excluded)
  let effectiveCategory = p.category
  let baseCategory: TaskCategory | undefined = undefined

  if (p.scheduledDate && p.category !== 'project') {
    baseCategory = p.category
    effectiveCategory = calculateEffectiveCategory(p.scheduledDate, p.scheduledTime, now)
  }

  // New tasks get sortOrder 0 (top of list), existing tasks shift down
  const task: Task = {
    id: p.id,
    title: p.title.trim(),
    description: p.description?.trim(),
    category: effectiveCategory,
    baseCategory,
    scheduledDate: p.scheduledDate,
    scheduledTime: p.scheduledTime,
    isDone: p.isDone ?? false,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    sortOrder: 0,
  }

  // Update cache immediately for responsiveness
  tasksCache = [
    task,
    ...tasksCache
      .filter((t) => t.id !== task.id)
      .map((t) => (t.category === task.category ? { ...t, sortOrder: (t.sortOrder ?? 0) + 1 } : t)),
  ]

  // Persist to Firestore (also updates shifted tasks)
  const tasksCollection = getTasksCollection()
  await setDoc(doc(tasksCollection, task.id), task)

  // Update shifted tasks in Firestore
  for (const t of tasksCache.filter((t) => t.category === task.category && t.id !== task.id)) {
    await setDoc(doc(tasksCollection, t.id), t)
  }

  return task
}

export const updateTask = async (p: {
  id: string
  title?: string
  description?: string | null
  isDone?: boolean
  category?: TaskCategory
  scheduledDate?: number | null
  scheduledTime?: string | null
  userPromoted?: boolean
}): Promise<Task | null | { error: string }> => {
  const err = validateTask(p)
  if (err) return { error: err }

  const existing = tasksCache.find((t) => t.id === p.id)
  if (!existing) return null

  const now = Date.now()

  // Handle scheduling field updates
  const newScheduledDate =
    p.scheduledDate === null ? undefined : (p.scheduledDate ?? existing.scheduledDate)
  const newScheduledTime =
    p.scheduledTime === null ? undefined : (p.scheduledTime ?? existing.scheduledTime)

  // Determine base category
  let newBaseCategory = existing.baseCategory
  if (p.category !== undefined) {
    // User is explicitly changing the category
    if (newScheduledDate && p.category !== 'project') {
      newBaseCategory = p.category
    } else if (!newScheduledDate) {
      newBaseCategory = undefined
    }
  } else if (p.scheduledDate !== undefined) {
    // Scheduling is being added/removed
    if (newScheduledDate && existing.category !== 'project') {
      newBaseCategory = existing.baseCategory ?? existing.category
    } else if (!newScheduledDate) {
      newBaseCategory = undefined
    }
  }

  // Calculate effective category
  let effectiveCategory = p.category ?? existing.category
  if (newScheduledDate && effectiveCategory !== 'project') {
    effectiveCategory = calculateEffectiveCategory(newScheduledDate, newScheduledTime, now)
  } else if (!newScheduledDate && existing.baseCategory) {
    // Schedule removed - revert to base category
    effectiveCategory = existing.baseCategory
  }

  const categoryChanged = effectiveCategory !== existing.category

  // If user explicitly promoted (via drag-drop), set the flag
  const newUserPromoted = p.userPromoted ?? existing.userPromoted

  const updated: Task = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    description:
      p.description === null ? undefined : (p.description?.trim() ?? existing.description),
    category: effectiveCategory,
    baseCategory: newBaseCategory,
    scheduledDate: newScheduledDate,
    scheduledTime: newScheduledTime,
    userPromoted: newUserPromoted,
    isDone: p.isDone ?? existing.isDone,
    updatedAt: now,
    sortOrder: categoryChanged ? 0 : (existing.sortOrder ?? 0), // Move to top if category changed
  }

  // Update cache
  if (categoryChanged) {
    tasksCache = tasksCache.map((t) => {
      if (t.id === p.id) return updated
      if (t.category === effectiveCategory) return { ...t, sortOrder: (t.sortOrder ?? 0) + 1 }
      return t
    })
  } else {
    tasksCache = tasksCache.map((t) => (t.id === p.id ? updated : t))
  }

  // Persist to Firestore
  const tasksCollection = getTasksCollection()
  await setDoc(doc(tasksCollection, updated.id), updated)

  // Update shifted tasks if category changed
  if (categoryChanged) {
    for (const t of tasksCache.filter(
      (t) => t.category === effectiveCategory && t.id !== updated.id
    )) {
      await setDoc(doc(tasksCollection, t.id), t)
    }
  }

  return updated
}

export const reorderTask = async (taskId: string, targetIndex: number): Promise<boolean> => {
  const task = tasksCache.find((t) => t.id === taskId)
  if (!task) return false

  // Get tasks in the same category, sorted by sortOrder
  const categoryTasks = tasksCache
    .filter((t) => t.category === task.category && !t.isDeleted)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const currentIndex = categoryTasks.findIndex((t) => t.id === taskId)
  if (currentIndex === -1 || currentIndex === targetIndex) return false

  // Remove task from current position and insert at target
  categoryTasks.splice(currentIndex, 1)
  categoryTasks.splice(targetIndex, 0, task)

  // Update sortOrder for all tasks in category
  const now = Date.now()
  const updatedTasks: Task[] = []

  categoryTasks.forEach((t, idx) => {
    if (t.sortOrder !== idx) {
      const updated = { ...t, sortOrder: idx, updatedAt: now }
      updatedTasks.push(updated)
    }
  })

  // Update cache
  tasksCache = tasksCache.map((t) => {
    if (t.category !== task.category) return t
    const idx = categoryTasks.findIndex((ct) => ct.id === t.id)
    if (idx === -1) return t
    return { ...t, sortOrder: idx, updatedAt: now }
  })

  // Persist to Firestore
  const tasksCollection = getTasksCollection()
  for (const t of updatedTasks) {
    await setDoc(doc(tasksCollection, t.id), t)
  }

  return true
}

export const deleteTask = async (id: string): Promise<void> => {
  tasksCache = tasksCache.filter((t) => t.id !== id)
  await deleteDoc(doc(getTasksCollection(), id))
}

// --- Project Notes ---

export const addProjectNote = async (p: {
  id: string
  taskId: string
  content: string
}): Promise<ProjectNote | { error: string }> => {
  const err = validateProjectNote(p)
  if (err) return { error: err }

  const task = tasksCache.find((t) => t.id === p.taskId)
  if (!task) return { error: 'Task not found' }

  const now = Date.now()
  const note: ProjectNote = {
    id: p.id,
    taskId: p.taskId,
    content: p.content.trim(),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  // Update task with new note
  const updatedTask: Task = {
    ...task,
    projectNotes: [...(task.projectNotes || []), note],
    updatedAt: now,
  }

  // Update cache
  tasksCache = tasksCache.map((t) => (t.id === p.taskId ? updatedTask : t))

  // Persist to Firestore
  await setDoc(doc(getTasksCollection(), p.taskId), updatedTask)

  return note
}

export const updateProjectNote = async (p: {
  id: string
  content: string
}): Promise<ProjectNote | null | { error: string }> => {
  const err = validateProjectNote(p)
  if (err) return { error: err }

  let foundNote: ProjectNote | null = null
  let taskId: string | null = null
  for (const task of tasksCache) {
    const note = task.projectNotes?.find((n) => n.id === p.id)
    if (note) {
      foundNote = note
      taskId = task.id
      break
    }
  }
  if (!foundNote || !taskId) return null

  const now = Date.now()
  const updated: ProjectNote = {
    ...foundNote,
    content: p.content.trim(),
    updatedAt: now,
  }

  // Update task
  const task = tasksCache.find((t) => t.id === taskId)!
  const updatedTask: Task = {
    ...task,
    projectNotes: (task.projectNotes ?? []).map((n) => (n.id === p.id ? updated : n)),
    updatedAt: now,
  }

  // Update cache
  tasksCache = tasksCache.map((t) => (t.id === taskId ? updatedTask : t))

  // Persist to Firestore
  await setDoc(doc(getTasksCollection(), taskId), updatedTask)

  return updated
}

export const deleteProjectNote = async (id: string): Promise<void> => {
  let taskId: string | null = null
  for (const task of tasksCache) {
    if (task.projectNotes?.find((n) => n.id === id)) {
      taskId = task.id
      break
    }
  }
  if (!taskId) return

  const task = tasksCache.find((t) => t.id === taskId)!
  const now = Date.now()
  const updatedTask: Task = {
    ...task,
    projectNotes: task.projectNotes?.filter((n) => n.id !== id),
    updatedAt: now,
  }

  // Update cache
  tasksCache = tasksCache.map((t) => (t.id === taskId ? updatedTask : t))

  // Persist to Firestore
  await setDoc(doc(getTasksCollection(), taskId), updatedTask)
}

// --- Notetank Notes ---

export const getNotes = async (): Promise<Note[]> => {
  return notesCache
}

export const addNote = async (p: {
  id: string
  title: string
  content: string
}): Promise<Note | { error: string }> => {
  const err = validateNotetankNote(p)
  if (err) return { error: err }

  const now = Date.now()
  const note: Note = {
    id: p.id,
    title: p.title.trim(),
    content: p.content.trim(),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }

  // Update cache
  notesCache = [note, ...notesCache.filter((n) => n.id !== note.id)]

  // Persist to Firestore
  await setDoc(doc(getNotesCollection(), note.id), note)

  return note
}

export const updateNote = async (p: {
  id: string
  title?: string
  content?: string
}): Promise<Note | null | { error: string }> => {
  const err = validateNotetankNote(p)
  if (err) return { error: err }

  const existing = notesCache.find((n) => n.id === p.id)
  if (!existing) return null

  const updated: Note = {
    ...existing,
    title: p.title !== undefined ? p.title.trim() : existing.title,
    content: p.content !== undefined ? p.content.trim() : existing.content,
    updatedAt: Date.now(),
  }

  // Update cache
  notesCache = notesCache.map((n) => (n.id === p.id ? updated : n))

  // Persist to Firestore
  await setDoc(doc(getNotesCollection(), p.id), updated)

  return updated
}

export const deleteNote = async (id: string): Promise<void> => {
  notesCache = notesCache.filter((n) => n.id !== id)
  await deleteDoc(doc(getNotesCollection(), id))
}

// --- Scheduled Task Category Recalculation ---

/**
 * Recalculate categories for all scheduled tasks based on current time.
 * Returns the number of tasks that were updated.
 */
export const recalculateScheduledCategories = async (): Promise<number> => {
  const now = Date.now()

  // Find tasks that need category updates
  const tasksNeedingUpdate = getTasksNeedingUpdate(tasksCache, now)

  if (tasksNeedingUpdate.length === 0) return 0

  const updatedIds = new Set<string>()
  const updatedTasks: Task[] = []

  for (const task of tasksNeedingUpdate) {
    const newCategory = calculateEffectiveCategory(task.scheduledDate!, task.scheduledTime, now)

    // Check if category actually changed (handles edge cases)
    if (newCategory === task.category) continue

    updatedIds.add(task.id)

    const updated: Task = {
      ...task,
      category: newCategory,
      updatedAt: now,
      sortOrder: 0, // Move to top of new category
    }
    updatedTasks.push(updated)
  }

  if (updatedIds.size === 0) return 0

  // Update cache
  tasksCache = tasksCache.map((task) => {
    const updated = updatedTasks.find((t) => t.id === task.id)
    if (updated) return updated
    return task
  })

  // Reassign sortOrder within categories
  const byCategory = new Map<TaskCategory, Task[]>()
  for (const task of tasksCache) {
    if (!byCategory.has(task.category)) byCategory.set(task.category, [])
    byCategory.get(task.category)!.push(task)
  }

  tasksCache = tasksCache.map((task) => {
    const categoryTasks = byCategory.get(task.category) ?? []
    const sorted = [...categoryTasks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const newSortOrder = sorted.findIndex((t) => t.id === task.id)
    return { ...task, sortOrder: newSortOrder >= 0 ? newSortOrder : task.sortOrder }
  })

  // Persist updated tasks to Firestore
  const tasksCollection = getTasksCollection()
  for (const id of updatedIds) {
    const task = tasksCache.find((t) => t.id === id)
    if (task) {
      await setDoc(doc(tasksCollection, id), task)
    }
  }

  return updatedIds.size
}
