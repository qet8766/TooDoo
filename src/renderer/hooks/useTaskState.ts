import { useCallback, useState } from 'react'
import type { ProjectNote, Task } from '@shared/types'

export const useTaskState = (initial: Task[] = []) => {
  const [tasks, setTasks] = useState<Task[]>(initial)

  const updateTask = useCallback((taskId: string, updated: Task) => {
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
  }, [])

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }, [])

  const updateTaskNotes = useCallback((taskId: string, updater: (notes: ProjectNote[]) => ProjectNote[]) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, projectNotes: updater(t.projectNotes ?? []) } : t
    ))
  }, [])

  return { tasks, setTasks, updateTask, removeTask, updateTaskNotes }
}
