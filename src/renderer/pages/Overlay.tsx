import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { ProjectNote, Task, TaskCategory } from '@shared/types'
import { CATEGORIES, NORMAL_CATEGORIES } from '@shared/categories'

const FONT_SIZE_KEY = 'toodoo-font-size'
const DEFAULT_FONT_SIZE = 14
const SYNC_STATUS_POLL_MS = 5000
const DELETE_ARM_TIMEOUT_MS = 2000

type SyncStatus = {
  isOnline: boolean
  pendingCount: number
  lastSyncAt: number
  circuitBreakerOpen: boolean
  nextRetryAt: number | null
}

const TooDooOverlay = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [editing, setEditing] = useState<Record<string, { title: string; description: string }>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState<{ taskId: string | null; text: string }>({ taskId: null, text: '' })
  const [editingNote, setEditingNote] = useState<{ noteId: string; content: string } | null>(null)
  const [armedForDelete, setArmedForDelete] = useState<Set<string>>(new Set())
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_FONT_SIZE
  })

  // Poll sync status
  useEffect(() => {
    const fetchSyncStatus = async () => {
      try {
        const status = await window.toodoo.sync.getStatus()
        setSyncStatus(status)
      } catch (error) {
        console.error('Failed to get sync status:', error)
      }
    }
    fetchSyncStatus()
    const interval = setInterval(fetchSyncStatus, SYNC_STATUS_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(10, Math.min(24, fontSize + delta))
    setFontSize(newSize)
    localStorage.setItem(FONT_SIZE_KEY, String(newSize))
  }

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await window.toodoo.tasks.list()
      setTasks(data)

      // Clean up timers for tasks/notes that no longer exist
      const existingIds = new Set<string>()
      for (const task of data) {
        existingIds.add(task.id)
        for (const note of task.projectNotes ?? []) {
          existingIds.add(note.id)
        }
      }
      // Clear timers for deleted items
      for (const [id, timer] of deleteTimers.current) {
        if (!existingIds.has(id)) {
          clearTimeout(timer)
          deleteTimers.current.delete(id)
        }
      }
      // Update armed state for deleted items
      setArmedForDelete(prev => {
        const next = new Set<string>()
        for (const id of prev) {
          if (existingIds.has(id)) next.add(id)
        }
        return next.size !== prev.size ? next : prev
      })
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Subscribe to task changes and fetch initial data
    const unsubscribe = window.toodoo.onTasksChanged(fetchTasks)
    fetchTasks()
    return unsubscribe
  }, [fetchTasks])

  // Cleanup delete timers on unmount
  useEffect(() => {
    const timers = deleteTimers.current
    return () => { timers.forEach(t => clearTimeout(t)) }
  }, [])

  const armForDelete = useCallback((id: string) => {
    // Clear existing timer if any
    const existing = deleteTimers.current.get(id)
    if (existing) clearTimeout(existing)

    setArmedForDelete(prev => new Set(prev).add(id))

    // Auto-disarm after timeout
    const timer = setTimeout(() => {
      setArmedForDelete(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      deleteTimers.current.delete(id)
    }, DELETE_ARM_TIMEOUT_MS)

    deleteTimers.current.set(id, timer)
  }, [])

  const disarmDelete = useCallback((id: string) => {
    const timer = deleteTimers.current.get(id)
    if (timer) clearTimeout(timer)
    deleteTimers.current.delete(id)
    setArmedForDelete(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const tasksByCategory = useMemo(() => {
    const buckets: Record<TaskCategory, Task[]> = {
      scorching: [], hot: [], warm: [], cool: [], project: []
    }
    return tasks.reduce((acc, task) => {
      if (acc[task.category]) acc[task.category].push(task)
      return acc
    }, buckets)
  }, [tasks])

  const isScorchingMode = tasksByCategory.scorching.length > 0
  const visibleCategories = useMemo(() => {
    return isScorchingMode ? [CATEGORIES.scorching] : NORMAL_CATEGORIES.map(k => CATEGORIES[k])
  }, [isScorchingMode])

  const handleDragStart = useCallback((taskId: string) => (e: DragEvent<HTMLDivElement>) => {
    setDraggingTaskId(taskId)
    e.dataTransfer?.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDropOnCategory = useCallback((category: TaskCategory) => async (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    const taskId = draggingTaskId || e.dataTransfer?.getData('text/plain')
    setDraggingTaskId(null)
    if (!taskId) return

    const result = await window.toodoo.tasks.update({ id: taskId, category })
    if (result && !('error' in result)) {
      setTasks((prev) => prev.map((item) => (item.id === taskId ? result : item)))
    } else if (result && 'error' in result) {
      console.error('Failed to update task category:', result.error)
    }
  }, [draggingTaskId])

  const allowDrop = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const startEdit = (task: Task) => {
    setEditing((prev) => ({ ...prev, [task.id]: { title: task.title, description: task.description ?? '' } }))
  }

  const saveEdit = async (taskId: string) => {
    const form = editing[taskId]
    if (!form) return
    const result = await window.toodoo.tasks.update({
      id: taskId,
      title: form.title,
      description: form.description.trim() ? form.description : null,
    })
    if (result && !('error' in result)) {
      setTasks((prev) => prev.map((item) => (item.id === taskId ? result : item)))
      setEditing((prev) => { const next = { ...prev }; delete next[taskId]; return next })
    } else if (result && 'error' in result) {
      console.error('Failed to save task:', result.error)
      // Keep editing mode open so user can fix the issue
    }
  }

  const removeTask = async (taskId: string) => {
    disarmDelete(taskId)
    await window.toodoo.tasks.remove(taskId)
    setTasks((prev) => prev.filter((item) => item.id !== taskId))
  }

  const handleTaskDeleteClick = (taskId: string) => {
    if (armedForDelete.has(taskId)) {
      removeTask(taskId)
    } else {
      armForDelete(taskId)
    }
  }

  const addNote = async (taskId: string, content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    const optimistic: ProjectNote = { id: crypto.randomUUID(), taskId, content: trimmed, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false }

    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectNotes: [...(t.projectNotes ?? []), optimistic] } : t))
    const result = await window.toodoo.tasks.addNote(optimistic)
    if (result && !('error' in result)) {
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectNotes: (t.projectNotes ?? []).map((n) => (n.id === optimistic.id ? result : n)) } : t))
    } else {
      // Remove optimistic update on error
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectNotes: (t.projectNotes ?? []).filter((n) => n.id !== optimistic.id) } : t))
      console.error('Failed to add note:', result && 'error' in result ? result.error : 'Unknown error')
    }
  }

  const submitNoteModal = () => {
    if (noteModal.taskId) void addNote(noteModal.taskId, noteModal.text)
    setNoteModal({ taskId: null, text: '' })
  }

  const deleteNote = async (taskId: string, noteId: string) => {
    disarmDelete(noteId)
    await window.toodoo.tasks.removeNote(noteId)
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectNotes: (t.projectNotes ?? []).filter((n) => n.id !== noteId) } : t))
  }

  const handleNoteDeleteClick = (taskId: string, noteId: string) => {
    if (armedForDelete.has(noteId)) {
      deleteNote(taskId, noteId)
    } else {
      armForDelete(noteId)
    }
  }

  const startEditNote = (note: ProjectNote) => {
    setEditingNote({ noteId: note.id, content: note.content })
  }

  const saveEditNote = async (taskId: string) => {
    if (!editingNote) return
    const trimmed = editingNote.content.trim()
    if (!trimmed) {
      setEditingNote(null)
      return
    }
    const result = await window.toodoo.tasks.updateNote({ id: editingNote.noteId, content: trimmed })
    if (result && !('error' in result)) {
      setTasks((prev) => prev.map((t) => t.id === taskId
        ? { ...t, projectNotes: (t.projectNotes ?? []).map((n) => n.id === editingNote.noteId ? result : n) }
        : t
      ))
    }
    setEditingNote(null)
  }

  return (
    <div className={`overlay-shell toodoo-compact ${isScorchingMode ? 'scorching-mode' : ''}`} style={{ fontSize: `${fontSize}px` }}>
      <div className="overlay-topbar-fixed" title="Drag to move">
        <div className="grip-dots"><span /><span /><span /></div>
        <div className="topbar-features">
          <button className="feature-btn no-drag" onClick={() => window.toodoo.switchView('notetank')} title="Switch to Notes">
            Notes
          </button>
        </div>
        <div className="topbar-controls no-drag">
          {syncStatus && (
            <div
              className={`sync-indicator ${syncStatus.circuitBreakerOpen ? 'error' : syncStatus.isOnline ? 'online' : 'offline'}`}
              title={
                syncStatus.circuitBreakerOpen
                  ? `Sync paused - too many failures. Click to retry.`
                  : syncStatus.isOnline
                    ? `Online${syncStatus.pendingCount > 0 ? ` - ${syncStatus.pendingCount} pending` : ''}`
                    : 'Offline - changes will sync when connected'
              }
              onClick={syncStatus.circuitBreakerOpen ? () => window.toodoo.sync.resetCircuitBreaker() : undefined}
              style={syncStatus.circuitBreakerOpen ? { cursor: 'pointer' } : undefined}
            >
              <span className="sync-dot" />
              {syncStatus.circuitBreakerOpen ? (
                <span className="sync-error">!</span>
              ) : syncStatus.pendingCount > 0 ? (
                <span className="sync-pending">{syncStatus.pendingCount}</span>
              ) : null}
            </div>
          )}
          <button className="font-btn" onClick={() => handleFontSizeChange(-1)}>A-</button>
          <button className="font-btn" onClick={() => handleFontSizeChange(1)}>A+</button>
        </div>
      </div>

      <div className="task-columns">
        {visibleCategories.map((cat) => {
          const list = tasksByCategory[cat.key] ?? []
          return (
            <section key={cat.key} className={`task-section compact tone-${cat.tone}`} onDragOver={allowDrop} onDrop={handleDropOnCategory(cat.key)}>
              <div className="section-header-compact">
                <button className="section-dot-btn" onClick={() => window.toodoo.openQuickAdd(cat.key)} title={`Add ${cat.key} task`}>
                  <span className="section-dot" />
                </button>
                <span className="count-pill">{list.length}</span>
              </div>

              {!isLoading && list.length === 0 && <p className="muted compact-muted">Empty</p>}
              <div className="task-list">
                {list.map((task) => {
                  const form = editing[task.id]
                  return (
                    <div
                      key={task.id}
                      className={`task-card no-drag ${cat.key === 'project' ? 'project-card' : ''}`}
                      draggable={!form}
                      onDragStart={handleDragStart(task.id)}
                      onDragEnd={() => setDraggingTaskId(null)}
                    >
                      <div className="task-card-header">
                        <div className={`checkbox delete-checkbox ${armedForDelete.has(task.id) ? 'armed' : ''}`} onClick={() => handleTaskDeleteClick(task.id)}>
                          <span />
                        </div>
                        {form ? (
                          <div className="task-editing">
                            <input className="edit-input" value={form.title} onChange={(e) => setEditing(p => ({ ...p, [task.id]: { ...form, title: e.target.value } }))} />
                            <textarea className="edit-textarea" rows={3} value={form.description} onChange={(e) => setEditing(p => ({ ...p, [task.id]: { ...form, description: e.target.value } }))} placeholder="Description" />
                          </div>
                        ) : (
                          <div className="task-text" onDoubleClick={() => startEdit(task)}>
                            <div className="task-title">{task.title}</div>
                            {task.description && <div className="muted small-text">{task.description}</div>}
                          </div>
                        )}
                        <div className="task-actions">
                          {form ? (
                            <><button className="small-button" onClick={() => saveEdit(task.id)}>Save</button><button className="small-button" onClick={() => setEditing(p => { const n = { ...p }; delete n[task.id]; return n })}>Cancel</button></>
                          ) : (
                            cat.key === 'project' && <button className="small-button" onClick={() => setNoteModal({ taskId: task.id, text: '' })}>Add note</button>
                          )}
                        </div>
                      </div>
                      {cat.key === 'project' && (
                        <div className="project-notes">
                          <div className="notes-list">
                            {(task.projectNotes ?? []).map((n) => (
                              <div key={n.id} className="note-row">
                                <div className={`checkbox delete-checkbox ${armedForDelete.has(n.id) ? 'armed' : ''}`} onClick={() => handleNoteDeleteClick(task.id, n.id)}>
                                  <span />
                                </div>
                                {editingNote?.noteId === n.id ? (
                                  <div className="note-editing">
                                    <input
                                      className="edit-input"
                                      value={editingNote.content}
                                      onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                                      onKeyDown={(e) => { if (e.key === 'Enter') saveEditNote(task.id); if (e.key === 'Escape') setEditingNote(null) }}
                                      autoFocus
                                    />
                                    <div className="note-edit-actions">
                                      <button className="small-button" onClick={() => saveEditNote(task.id)}>Save</button>
                                      <button className="small-button" onClick={() => setEditingNote(null)}>Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <p onDoubleClick={() => startEditNote(n)}>{n.content}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      {noteModal.taskId && (
        <div className="modal-backdrop">
          <div className="modal-card no-drag">
            <h4>Add note</h4>
            <textarea className="modal-textarea" rows={4} value={noteModal.text} onChange={(e) => setNoteModal(p => ({ ...p, text: e.target.value }))} placeholder="Note" />
            <div className="modal-actions">
              <button className="button" onClick={submitNoteModal}>Save</button>
              <button className="small-button" onClick={() => setNoteModal({ taskId: null, text: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TooDooOverlay
