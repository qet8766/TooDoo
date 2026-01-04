export type TaskCategory = 'scorching' | 'hot' | 'warm' | 'cool' | 'project'

export interface ProjectNote {
  id: string
  taskId: string
  content: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
}

export interface Task {
  id: string
  title: string
  description?: string
  category: TaskCategory
  isDone: boolean
  createdAt: number
  updatedAt: number
  isDeleted: boolean
  sortOrder: number
  projectNotes?: ProjectNote[]
  // Calendar scheduling fields
  scheduledDate?: number      // Unix timestamp (midnight of scheduled date)
  scheduledTime?: string      // "HH:MM" format, optional
  baseCategory?: TaskCategory // Original category for scheduled tasks (before auto-promotion)
  userPromoted?: boolean      // If true, user manually promoted this task (skip auto-demotion)
}

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
}
