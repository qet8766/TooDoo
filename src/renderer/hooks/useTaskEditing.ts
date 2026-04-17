import { useCallback, useReducer } from 'react'
import type { Task } from '@shared/types'

export type EditForm = {
  title: string
  description: string
  scheduledDate: string // YYYY-MM-DD, empty string means cleared
  scheduledTime: string // HH:MM, empty string means cleared
}

type EditState = Record<string, EditForm>

type EditAction =
  | { type: 'start'; task: Task }
  | { type: 'change'; taskId: string; patch: Partial<EditForm> }
  | { type: 'cancel'; taskId: string }

const reducer = (state: EditState, action: EditAction): EditState => {
  switch (action.type) {
    case 'start': {
      const task = action.task
      const dateStr = task.scheduledDate ? new Date(task.scheduledDate).toISOString().split('T')[0] : ''
      return {
        ...state,
        [task.id]: {
          title: task.title,
          description: task.description ?? '',
          scheduledDate: dateStr,
          scheduledTime: task.scheduledTime ?? '',
        },
      }
    }
    case 'change': {
      const current = state[action.taskId]
      if (!current) return state
      return { ...state, [action.taskId]: { ...current, ...action.patch } }
    }
    case 'cancel': {
      if (!(action.taskId in state)) return state
      const next = { ...state }
      delete next[action.taskId]
      return next
    }
  }
}

/**
 * Reducer-backed task editing state.
 *
 * The UI binds to `editing[taskId]` for its inputs; transitions happen via
 * the returned actions. `saveEdit` calls the main process, and on success
 * both closes the editor and invokes the optional `onSaved` callback so
 * the caller can patch its own task cache optimistically (the IPC broadcast
 * arrives shortly after; the optimistic update hides the latency).
 */
export function useTaskEditing(options?: { onSaved?: (task: Task) => void }): {
  editing: EditState
  startEdit: (task: Task) => void
  updateEdit: (taskId: string, patch: Partial<EditForm>) => void
  cancelEdit: (taskId: string) => void
  saveEdit: (taskId: string) => Promise<void>
} {
  const [editing, dispatch] = useReducer(reducer, {})

  const startEdit = useCallback((task: Task) => {
    dispatch({ type: 'start', task })
  }, [])

  const updateEdit = useCallback((taskId: string, patch: Partial<EditForm>) => {
    dispatch({ type: 'change', taskId, patch })
  }, [])

  const cancelEdit = useCallback((taskId: string) => {
    dispatch({ type: 'cancel', taskId })
  }, [])

  const onSaved = options?.onSaved
  const saveEdit = useCallback(
    async (taskId: string) => {
      const form = editing[taskId]
      if (!form) return

      // YYYY-MM-DD → local midnight Unix ms. Empty string means "clear".
      let scheduledDate: number | null = null
      if (form.scheduledDate) {
        const date = new Date(form.scheduledDate)
        date.setHours(0, 0, 0, 0)
        scheduledDate = date.getTime()
      }

      const result = await window.toodoo.tasks.update({
        id: taskId,
        title: form.title,
        description: form.description.trim() ? form.description : null,
        scheduledDate,
        scheduledTime: form.scheduledTime || null,
      })

      if (result.success && result.data) {
        dispatch({ type: 'cancel', taskId })
        onSaved?.(result.data)
      } else if (!result.success) {
        console.error('Failed to save task:', result.error)
        // Keep editing mode open so the user can fix the issue.
      }
    },
    [editing, onSaved],
  )

  return { editing, startEdit, updateEdit, cancelEdit, saveEdit }
}
