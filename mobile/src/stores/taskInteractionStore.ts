import { create } from 'zustand'

export type EditForm = {
  title: string
  description: string
  scheduledDate: Date | null
  scheduledTime: string
}

const ARM_TIMEOUT_MS = 2000

type State = {
  editingTaskId: string | null
  editForm: EditForm | null
  armedTasks: Set<string>
  armedNotes: Set<string>
}

type Actions = {
  startEdit: (id: string, form: EditForm) => void
  updateForm: (form: EditForm) => void
  cancelEdit: () => void
  armOrConfirmTask: (id: string) => boolean
  armOrConfirmNote: (id: string) => boolean
  disarmAll: () => void
}

const taskTimers = new Map<string, ReturnType<typeof setTimeout>>()
const noteTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useTaskInteractionStore = create<State & Actions>((set, get) => {
  const autoDisarm = (
    id: string,
    table: Map<string, ReturnType<typeof setTimeout>>,
    field: 'armedTasks' | 'armedNotes',
  ) => {
    const prev = table.get(id)
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      table.delete(id)
      const next = new Set(get()[field])
      next.delete(id)
      set({ [field]: next } as Pick<State, 'armedTasks'> | Pick<State, 'armedNotes'>)
    }, ARM_TIMEOUT_MS)
    table.set(id, t)
  }

  const armOrConfirm = (
    id: string,
    table: Map<string, ReturnType<typeof setTimeout>>,
    field: 'armedTasks' | 'armedNotes',
  ): boolean => {
    const armed = get()[field]
    if (armed.has(id)) {
      const t = table.get(id)
      if (t) clearTimeout(t)
      table.delete(id)
      const next = new Set(armed)
      next.delete(id)
      set({ [field]: next } as Pick<State, 'armedTasks'> | Pick<State, 'armedNotes'>)
      return true
    }
    const next = new Set(armed)
    next.add(id)
    set({ [field]: next } as Pick<State, 'armedTasks'> | Pick<State, 'armedNotes'>)
    autoDisarm(id, table, field)
    return false
  }

  return {
    editingTaskId: null,
    editForm: null,
    armedTasks: new Set(),
    armedNotes: new Set(),
    startEdit: (id, form) => set({ editingTaskId: id, editForm: form }),
    updateForm: (form) => set({ editForm: form }),
    cancelEdit: () => set({ editingTaskId: null, editForm: null }),
    armOrConfirmTask: (id) => armOrConfirm(id, taskTimers, 'armedTasks'),
    armOrConfirmNote: (id) => armOrConfirm(id, noteTimers, 'armedNotes'),
    disarmAll: () => {
      taskTimers.forEach(clearTimeout)
      taskTimers.clear()
      noteTimers.forEach(clearTimeout)
      noteTimers.clear()
      set({ armedTasks: new Set(), armedNotes: new Set() })
    },
  }
})
