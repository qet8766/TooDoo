import { useMemo } from 'react'
import type { Task, TaskCategory } from '@shared/types'
import { CATEGORIES, NORMAL_CATEGORIES, type CategoryConfig } from '@shared/categories'
import { useTaskStore } from '../stores/taskStore'

export type TaskSections = Record<TaskCategory, Task[]>

export function useTaskSections() {
  const tasks = useTaskStore((s) => s.tasks)

  return useMemo(() => {
    const active = tasks.filter((t) => !t.deletedAt)

    const sections: TaskSections = {
      scorching: [],
      hot: [],
      warm: [],
      cool: [],
      timed: [],
    }

    for (const task of active) {
      sections[task.category].push(task)
    }

    // Heat categories: sort by fractional sortOrder (string comparison, not localeCompare)
    for (const cat of ['scorching', 'hot', 'warm', 'cool'] as const) {
      sections[cat].sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0))
    }

    // Timed: sort by scheduledDate ascending, unscheduled at bottom
    sections.timed.sort((a, b) => {
      const aDate = a.scheduledDate ?? Infinity
      const bDate = b.scheduledDate ?? Infinity
      if (aDate !== bDate) return aDate - bDate
      return a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
    })

    const isScorchingMode = sections.scorching.length > 0

    const visibleCategories: CategoryConfig[] = isScorchingMode
      ? [CATEGORIES.scorching, CATEGORIES.timed]
      : NORMAL_CATEGORIES.map((k) => CATEGORIES[k])

    return { sections, isScorchingMode, visibleCategories }
  }, [tasks])
}
