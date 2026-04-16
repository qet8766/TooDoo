export type TaskCategory = 'scorching' | 'hot' | 'warm' | 'cool' | 'timed'

export interface ProjectNote {
  id: string
  taskId: string
  content: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface Task {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone: boolean
  createdAt: number
  updatedAt: number
  sortOrder: string
  projectNotes?: ProjectNote[]
  // Calendar scheduling fields
  scheduledDate?: number // Unix timestamp (midnight of scheduled date)
  scheduledTime?: string // "HH:MM" format, optional
  deletedAt?: number
}

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}
