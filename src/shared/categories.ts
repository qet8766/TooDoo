import type { TaskCategory } from './types'

export type CategoryConfig = {
  key: TaskCategory
  title: string
  tone: 'cyan' | 'amber' | 'violet' | 'crimson' | 'red' | 'yellow' | 'white' | 'blue'
}

export const CATEGORIES: Record<TaskCategory, CategoryConfig> = {
  scorching: { key: 'scorching', title: 'Scorching', tone: 'white' },
  hot: { key: 'hot', title: 'Hot', tone: 'red' },
  warm: { key: 'warm', title: 'Warm', tone: 'yellow' },
  cool: { key: 'cool', title: 'Cool', tone: 'blue' },
  project: { key: 'project', title: 'Project', tone: 'violet' },
}

export const NORMAL_CATEGORIES: TaskCategory[] = ['hot', 'warm', 'cool', 'project']
export const ALL_CATEGORIES: TaskCategory[] = ['scorching', 'hot', 'warm', 'cool', 'project']
