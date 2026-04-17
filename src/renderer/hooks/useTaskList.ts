import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task, TaskCategory } from '@shared/types'
import { CATEGORIES, HEAT_CATEGORIES, NORMAL_CATEGORIES, type CategoryConfig } from '@shared/categories'

export type TasksByCategory = Record<TaskCategory, Task[]>

/**
 * Owns the overlay's task cache: initial fetch, onTasksChanged subscription,
 * and derived views (bucketed + sorted by category, scorching mode flag,
 * visible category list). Callers that perform optimistic updates (edit,
 * drag) reach for `setTasks` to patch the cache before the broadcast arrives.
 */
export function useTaskList() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await window.toodoo.tasks.list()
      setTasks(data)
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.toodoo.onTasksChanged(fetchTasks)
    fetchTasks()
    return unsubscribe
  }, [fetchTasks])

  const tasksByCategory = useMemo<TasksByCategory>(() => {
    const buckets: TasksByCategory = {
      scorching: [],
      hot: [],
      warm: [],
      cool: [],
      timed: [],
    }
    const result = tasks.reduce((acc, task) => {
      if (acc[task.category]) acc[task.category].push(task)
      return acc
    }, buckets)

    // Heat categories: fractional-index string compare.
    for (const cat of HEAT_CATEGORIES) {
      result[cat].sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0))
    }

    // Timed: soonest deadline first, unscheduled at the bottom.
    result.timed.sort((a, b) => {
      if (a.scheduledDate && b.scheduledDate) return a.scheduledDate - b.scheduledDate
      if (a.scheduledDate) return -1
      if (b.scheduledDate) return 1
      return a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
    })
    return result
  }, [tasks])

  const isScorchingMode = tasksByCategory.scorching.length > 0

  const visibleCategories = useMemo<CategoryConfig[]>(() => {
    if (isScorchingMode) return [CATEGORIES.scorching, CATEGORIES.timed]
    return NORMAL_CATEGORIES.map((k) => CATEGORIES[k])
  }, [isScorchingMode])

  return { tasks, setTasks, isLoading, tasksByCategory, isScorchingMode, visibleCategories }
}
