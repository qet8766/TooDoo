export type TaskCategory = 'short_term' | 'long_term' | 'project' | 'immediate'

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
  projectNotes?: ProjectNote[]
}
