import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import type { ProjectNote, Task, TaskCategory } from '@shared/types'
import { CATEGORIES, NORMAL_CATEGORIES } from '@shared/categories'

const FONT_SIZE_KEY = 'toodoo-font-size'
const DEFAULT_FONT_SIZE = 14

const TooDooOverlay = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [editing, setEditing] = useState<Record<string, { title: string; description: string }>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState<{ taskId: string | null; text: string }>({ taskId: null, text: '' })
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_FONT_SIZE
  })

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(10, Math.min(24, fontSize + delta))
    setFontSize(newSize)
    localStorage.setItem(FONT_SIZE_KEY, String(newSize))
  }

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    const data = await window.toodoo.tasks.list()
    setTasks(data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    // Subscribe to task changes and fetch initial data
    const unsubscribe = window.toodoo.onTasksChanged(fetchTasks)
    // Schedule initial fetch asynchronously to avoid synchronous setState in effect
    queueMicrotask(fetchTasks)
    return unsubscribe
  }, [fetchTasks])

  const tasksByCategory = useMemo(() => {
    const buckets: Record<TaskCategory, Task[]> = { short_term: [], long_term: [], project: [], immediate: [] }
    tasks.forEach((task) => buckets[task.category]?.push(task))
    return buckets
  }, [tasks])

  const isImmediateMode = tasksByCategory.immediate.length > 0
  const visibleCategories = isImmediateMode ? [CATEGORIES.immediate] : NORMAL_CATEGORIES.map(k => CATEGORIES[k])

  const handleDragStart = (taskId: string) => (e: DragEvent<HTMLDivElement>) => {
    setDraggingTaskId(taskId)
    e.dataTransfer?.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDropOnCategory = (category: TaskCategory) => async (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    const taskId = draggingTaskId || e.dataTransfer?.getData('text/plain')
    setDraggingTaskId(null)
    if (!taskId) return

    const updated = await window.toodoo.tasks.update({ id: taskId, category })
    if (updated) setTasks((prev) => prev.map((item) => (item.id === taskId ? updated : item)))
  }

  const allowDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const startEdit = (task: Task) => {
    setEditing((prev) => ({ ...prev, [task.id]: { title: task.title, description: task.description ?? '' } }))
  }

  const saveEdit = async (taskId: string) => {
    const form = editing[taskId]
    if (!form) return
    const updated = await window.toodoo.tasks.update({
      id: taskId,
      title: form.title,
      description: form.description.trim() ? form.description : null,
    })
    if (updated) setTasks((prev) => prev.map((item) => (item.id === taskId ? updated : item)))
    setEditing((prev) => { const next = { ...prev }; delete next[taskId]; return next })
  }

  const removeTask = async (taskId: string) => {
    await window.toodoo.tasks.remove(taskId)
    setTasks((prev) => prev.filter((item) => item.id !== taskId))
  }

  const toggleDone = async (task: Task) => {
    const updated = await window.toodoo.tasks.update({ id: task.id, isDone: !task.isDone })
    if (updated) setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)))
  }

  const addNote = async (taskId: string, content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    const optimistic: ProjectNote = { id: crypto.randomUUID(), taskId, content: trimmed, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false }

    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectNotes: [...(t.projectNotes ?? []), optimistic] } : t))
    const saved = await window.toodoo.tasks.addNote(optimistic)
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectNotes: (t.projectNotes ?? []).map((n) => (n.id === optimistic.id ? saved : n)) } : t))
  }

  const submitNoteModal = () => {
    if (noteModal.taskId) void addNote(noteModal.taskId, noteModal.text)
    setNoteModal({ taskId: null, text: '' })
  }

  const deleteNote = async (taskId: string, noteId: string) => {
    await window.toodoo.tasks.removeNote(noteId)
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, projectNotes: (t.projectNotes ?? []).filter((n) => n.id !== noteId) } : t))
  }

  return (
    <div className={`overlay-shell toodoo-compact ${isImmediateMode ? 'immediate-mode' : ''}`} style={{ fontSize: `${fontSize}px` }}>
      <div className="overlay-topbar-fixed" title="Drag to move">
        <div className="grip-dots"><span /><span /><span /></div>
        <div className="topbar-controls no-drag">
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
                <span className="section-dot" />
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
                        <label className="checkbox" onDoubleClick={() => removeTask(task.id)}>
                          <input
                            type="checkbox"
                            checked={task.isDone}
                            onChange={() => toggleDone(task)}
                          />
                          <span />
                        </label>
                        {form ? (
                          <div className="task-editing">
                            <input className="edit-input" value={form.title} onChange={(e) => setEditing(p => ({ ...p, [task.id]: { ...form, title: e.target.value } }))} />
                            <textarea className="edit-textarea" rows={3} value={form.description} onChange={(e) => setEditing(p => ({ ...p, [task.id]: { ...form, description: e.target.value } }))} placeholder="Description" />
                          </div>
                        ) : (
                          <div className="task-text">
                            <div className="task-title">{task.title}</div>
                            {task.description && <div className="muted small-text">{task.description}</div>}
                          </div>
                        )}
                        <div className="task-actions">
                          {form ? (
                            <><button className="small-button" onClick={() => saveEdit(task.id)}>Save</button><button className="small-button" onClick={() => setEditing(p => { const n = { ...p }; delete n[task.id]; return n })}>Cancel</button></>
                          ) : (
                            <>
                              {cat.key === 'project' && <button className="small-button" onClick={() => setNoteModal({ taskId: task.id, text: '' })}>Add note</button>}
                              <button className="small-button" onClick={() => startEdit(task)}>Edit</button>
                            </>
                          )}
                        </div>
                      </div>
                      {cat.key === 'project' && (
                        <div className="project-notes">
                          <div className="notes-list">
                            {(task.projectNotes ?? []).map((n) => (
                              <div key={n.id} className="note-row">
                                <label className="checkbox" onDoubleClick={() => deleteNote(task.id, n.id)}>
                                  <input type="checkbox" readOnly />
                                  <span />
                                </label>
                                <p>{n.content}</p>
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
