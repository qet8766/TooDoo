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
}

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
}
