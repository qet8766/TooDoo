import type { TaskCategory } from './types'

export type CategoryConfig = {
  key: TaskCategory
  title: string
  tone: 'cyan' | 'amber' | 'violet' | 'crimson'
}

export const CATEGORIES: Record<TaskCategory, CategoryConfig> = {
  short_term: { key: 'short_term', title: 'Short-term', tone: 'cyan' },
  long_term: { key: 'long_term', title: 'Long-term', tone: 'amber' },
  project: { key: 'project', title: 'Project', tone: 'violet' },
  immediate: { key: 'immediate', title: 'Immediate', tone: 'crimson' },
}

export const NORMAL_CATEGORIES: TaskCategory[] = ['short_term', 'long_term', 'project']
