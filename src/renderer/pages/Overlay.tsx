import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { ProjectNote, TaskCategory } from '@shared/types'
import { calculateDDay, getDDayUrgency } from '@shared/category-calculator'
import { CalendarPanel } from '../components/Calendar'
import { useFontSize } from '../hooks/useFontSize'
import { useDeleteArm } from '../hooks/useDeleteArm'
import { useTaskList } from '../hooks/useTaskList'
import { useMinimizeTimer } from '../hooks/useMinimizeTimer'
import { useTaskEditing } from '../hooks/useTaskEditing'

const TooDooOverlay = () => {
  const { tasks, setTasks, isLoading, tasksByCategory, isScorchingMode, visibleCategories } = useTaskList()
  const { isMinimized, handleMinimize, handleExpand } = useMinimizeTimer(isScorchingMode)
  const { editing, startEdit, updateEdit, cancelEdit, saveEdit } = useTaskEditing({
    onSaved: (task) => setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t))),
  })

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ category: TaskCategory; index: number } | null>(null)
  const [noteModal, setNoteModal] = useState<{ taskId: string | null; text: string }>({ taskId: null, text: '' })
  const [editingNote, setEditingNote] = useState<{ noteId: string; content: string } | null>(null)
  const { fontSize, handleFontSizeChange } = useFontSize('toodoo-font-size')
  const { armedForDelete, armForDelete, disarmDelete, deleteTimers } = useDeleteArm()
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string>('offline')
  const [showSignIn, setShowSignIn] = useState(false)
  const [signInForm, setSignInForm] = useState({ email: '', password: '' })
  const [signInError, setSignInError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Disarm delete timers for tasks/notes that no longer exist in the cache.
  useEffect(() => {
    const existingIds = new Set<string>()
    for (const task of tasks) {
      existingIds.add(task.id)
      for (const note of task.projectNotes ?? []) existingIds.add(note.id)
    }
    for (const id of [...deleteTimers.current.keys()]) {
      if (!existingIds.has(id)) disarmDelete(id)
    }
  }, [tasks, deleteTimers, disarmDelete])

  // Notify main process when calendar opens/closes so it can resize the window.
  // Ref-guard avoids duplicate IPC calls on benign re-renders.
  const lastCalendarStateRef = useRef(false)
  useEffect(() => {
    if (lastCalendarStateRef.current !== isCalendarOpen) {
      lastCalendarStateRef.current = isCalendarOpen
      window.toodoo.setCalendarOpen(isCalendarOpen)
    }
  }, [isCalendarOpen])

  // Sync + auth status subscriptions.
  useEffect(() => {
    window.toodoo.sync.getStatus().then((s) => setSyncStatus(s.status))
    const unsub = window.toodoo.onSyncStatusChanged((s) => setSyncStatus(s.status))
    return unsub
  }, [])

  useEffect(() => {
    window.toodoo.auth.getStatus().then((status) => {
      if (!status.isSignedIn) setShowSignIn(true)
    })
    const unsub = window.toodoo.onAuthStatusChanged((status) => {
      if (status.isSignedIn) setShowSignIn(false)
    })
    return unsub
  }, [])

  const handleSignIn = async () => {
    setSignInError('')
    setSigningIn(true)
    const result = await window.toodoo.auth.signIn(signInForm)
    setSigningIn(false)
    if (result.success) {
      setShowSignIn(false)
      setSignInForm({ email: '', password: '' })
    } else {
      setSignInError(result.error)
    }
  }

  const handleDragStart = useCallback(
    (taskId: string) => (e: DragEvent<HTMLDivElement>) => {
      setDraggingTaskId(taskId)
      e.dataTransfer?.setData('text/plain', taskId)
      e.dataTransfer.effectAllowed = 'move'
    },
    [],
  )

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null)
    setDropTarget(null)
  }, [])

  const handleDragOverTask = useCallback(
    (category: TaskCategory, index: number) => (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget({ category, index })
    },
    [],
  )

  const handleDropOnTask = useCallback(
    (category: TaskCategory, targetIndex: number) => async (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const taskId = draggingTaskId || e.dataTransfer?.getData('text/plain')
      setDraggingTaskId(null)
      setDropTarget(null)
      if (!taskId) return

      const task = tasks.find((t) => t.id === taskId)
      if (!task) return

      // If same category, reorder
      if (task.category === category) {
        await window.toodoo.tasks.reorder({ taskId, targetIndex })
      } else {
        // Move to different category (at target position)
        const result = await window.toodoo.tasks.update({ id: taskId, category })
        if (result.success) {
          // After moving, reorder to specific position
          await window.toodoo.tasks.reorder({ taskId, targetIndex })
        }
      }
    },
    [draggingTaskId, tasks],
  )

  const handleDropOnCategory = useCallback(
    (category: TaskCategory) => async (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      const taskId = draggingTaskId || e.dataTransfer?.getData('text/plain')
      setDraggingTaskId(null)
      setDropTarget(null)
      if (!taskId) return

      const result = await window.toodoo.tasks.update({ id: taskId, category })
      if (result.success && result.data) {
        setTasks((prev) => prev.map((item) => (item.id === taskId ? result.data! : item)))
      } else if (!result.success) {
        console.error('Failed to update task category:', result.error)
      }
    },
    [draggingTaskId],
  )

  const allowDrop = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

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
    const optimistic: ProjectNote = {
      id: crypto.randomUUID(),
      taskId,
      content: trimmed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, projectNotes: [...(t.projectNotes ?? []), optimistic] } : t)),
    )
    const result = await window.toodoo.tasks.addNote(optimistic)
    if (result.success) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, projectNotes: (t.projectNotes ?? []).map((n) => (n.id === optimistic.id ? result.data : n)) }
            : t,
        ),
      )
    } else {
      // Remove optimistic update on error
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, projectNotes: (t.projectNotes ?? []).filter((n) => n.id !== optimistic.id) } : t,
        ),
      )
      console.error('Failed to add note:', result.error)
    }
  }

  const submitNoteModal = () => {
    if (noteModal.taskId) void addNote(noteModal.taskId, noteModal.text)
    setNoteModal({ taskId: null, text: '' })
  }

  const deleteNote = async (taskId: string, noteId: string) => {
    disarmDelete(noteId)
    await window.toodoo.tasks.removeNote(noteId)
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, projectNotes: (t.projectNotes ?? []).filter((n) => n.id !== noteId) } : t,
      ),
    )
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
    if (result.success && result.data) {
      const updated = result.data
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, projectNotes: (t.projectNotes ?? []).map((n) => (n.id === editingNote.noteId ? updated : n)) }
            : t,
        ),
      )
    }
    setEditingNote(null)
  }

  return (
    <div
      data-testid="overlay"
      className={`overlay-shell toodoo-compact ${isScorchingMode ? 'scorching-mode' : ''} ${isMinimized ? 'minimized' : ''}`}
      style={{ fontSize: `${fontSize}px` }}
    >
      <div data-testid="topbar" className="overlay-topbar-fixed" title="Drag to move">
        {isMinimized ? (
          <div className="minimized-bar no-drag">
            {visibleCategories.map((cat) => (
              <button
                key={cat.key}
                className={`minimized-dot tone-${cat.tone}`}
                onClick={() => window.toodoo.openQuickAdd(cat.key)}
                title={`Add ${cat.title} task`}
              >
                <span className="dot" />
                <span className="count">{tasksByCategory[cat.key]?.length ?? 0}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <button
              data-testid="quick-add-scorching"
              className="scorching-dot no-drag"
              onClick={() => window.toodoo.openQuickAdd('scorching')}
              title="Add scorching task (CapsLock)"
            >
              <span className="dot" />
              {tasksByCategory.scorching.length > 0 && (
                <span className="count">{tasksByCategory.scorching.length}</span>
              )}
            </button>
            <div className="topbar-features">
              <button
                data-testid="btn-view-notetank"
                className="feature-btn no-drag"
                onClick={() => window.toodoo.switchView('notetank')}
                title="Switch to Notes"
              >
                Notes
              </button>
              <button
                data-testid="btn-calendar"
                className={`feature-btn no-drag ${isCalendarOpen ? 'active' : ''}`}
                onClick={() => setIsCalendarOpen((prev) => !prev)}
                title="Toggle Calendar"
              >
                Cal
              </button>
            </div>
          </>
        )}
        <div className="topbar-controls no-drag">
          <span className={`sync-dot sync-${syncStatus}`} title={`Sync: ${syncStatus}`} />
          <button className="font-btn" onClick={() => handleFontSizeChange(-1)}>
            A-
          </button>
          <button className="font-btn" onClick={() => handleFontSizeChange(1)}>
            A+
          </button>
          {isMinimized ? (
            <button className="font-btn focus-btn" onClick={handleExpand} title="Expand (or wait 1 hour)">
              ▲
            </button>
          ) : (
            <button
              className="font-btn focus-btn"
              onClick={handleMinimize}
              disabled={isScorchingMode}
              title={isScorchingMode ? 'Clear scorching tasks first' : 'Focus mode (auto-expands in 1 hour)'}
            >
              ▼
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <div className="overlay-main">
          <div className="task-columns">
            {visibleCategories.map((cat) => {
              const list = tasksByCategory[cat.key] ?? []
              return (
                <section
                  key={cat.key}
                  data-testid={`category-${cat.key}`}
                  className={`task-section compact tone-${cat.tone}`}
                  onDragOver={allowDrop}
                  onDrop={handleDropOnCategory(cat.key)}
                >
                  <div className="section-header-compact">
                    <button
                      className="section-dot-btn"
                      onClick={() => window.toodoo.openQuickAdd(cat.key)}
                      title={`Add ${cat.key} task`}
                    >
                      <span className="section-dot" />
                    </button>
                    <span className="count-pill">{list.length}</span>
                  </div>

                  {!isLoading && list.length === 0 && <p className="muted compact-muted">Empty</p>}
                  <div className="task-list">
                    {list.map((task, index) => {
                      const form = editing[task.id]
                      const isDropTarget = dropTarget?.category === cat.key && dropTarget?.index === index
                      return (
                        <div
                          key={task.id}
                          data-testid={`task-${task.id}`}
                          className={`task-card no-drag ${cat.key === 'timed' ? 'timed-card' : ''} ${isDropTarget ? 'drop-target' : ''} ${draggingTaskId === task.id ? 'dragging' : ''}`}
                          draggable={!form}
                          onDragStart={handleDragStart(task.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={handleDragOverTask(cat.key, index)}
                          onDrop={handleDropOnTask(cat.key, index)}
                        >
                          <div className="task-card-header">
                            <div
                              data-testid={`task-delete-${task.id}`}
                              className={`checkbox delete-checkbox ${armedForDelete.has(task.id) ? 'armed' : ''}`}
                              onClick={() => handleTaskDeleteClick(task.id)}
                            >
                              <span />
                            </div>
                            {form ? (
                              <div className="task-editing">
                                <input
                                  className="edit-input"
                                  value={form.title}
                                  onChange={(e) => updateEdit(task.id, { title: e.target.value })}
                                />
                                <textarea
                                  className="edit-textarea"
                                  rows={3}
                                  value={form.description}
                                  onChange={(e) => updateEdit(task.id, { description: e.target.value })}
                                  placeholder="Description"
                                />
                                <div className="edit-schedule-row">
                                  <input
                                    type="date"
                                    className="edit-date-input"
                                    value={form.scheduledDate}
                                    onChange={(e) => updateEdit(task.id, { scheduledDate: e.target.value })}
                                    title="Schedule date"
                                  />
                                  <input
                                    type="time"
                                    className="edit-time-input"
                                    value={form.scheduledTime}
                                    onChange={(e) => updateEdit(task.id, { scheduledTime: e.target.value })}
                                    title="Schedule time (optional)"
                                  />
                                  {(form.scheduledDate || form.scheduledTime) && (
                                    <button
                                      type="button"
                                      className="small-button clear-schedule-btn"
                                      onClick={() => updateEdit(task.id, { scheduledDate: '', scheduledTime: '' })}
                                      title="Clear schedule"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="task-text" onDoubleClick={() => startEdit(task)}>
                                <div className="task-title" data-task-title>
                                  {task.title}
                                  {task.scheduledDate &&
                                    (cat.key === 'timed' ? (
                                      <>
                                        <span className={`d-day-marker ${getDDayUrgency(task.scheduledDate) ?? ''}`}>
                                          {calculateDDay(task.scheduledDate)}
                                        </span>
                                        <span className="d-day-date">
                                          {new Date(task.scheduledDate).toLocaleDateString('ko-KR', {
                                            month: 'short',
                                            day: 'numeric',
                                          })}
                                          {task.scheduledTime ? ` ${task.scheduledTime}` : ''}
                                        </span>
                                      </>
                                    ) : (
                                      <span
                                        className="schedule-indicator"
                                        title={`Scheduled: ${new Date(task.scheduledDate).toLocaleDateString('ko-KR')}${task.scheduledTime ? ` ${task.scheduledTime}` : ''}`}
                                      >
                                        📅
                                      </span>
                                    ))}
                                </div>
                                {task.description && <div className="muted small-text">{task.description}</div>}
                              </div>
                            )}
                            <div className="task-actions">
                              {form ? (
                                <>
                                  <button className="small-button" onClick={() => saveEdit(task.id)}>
                                    Save
                                  </button>
                                  <button className="small-button" onClick={() => cancelEdit(task.id)}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                cat.key === 'timed' && (
                                  <button
                                    className="small-button"
                                    onClick={() => setNoteModal({ taskId: task.id, text: '' })}
                                  >
                                    Add note
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                          {cat.key === 'timed' && (
                            <div className="timed-notes">
                              <div className="notes-list">
                                {(task.projectNotes ?? []).map((n) => (
                                  <div key={n.id} className="note-row">
                                    <div
                                      className={`checkbox delete-checkbox ${armedForDelete.has(n.id) ? 'armed' : ''}`}
                                      onClick={() => handleNoteDeleteClick(task.id, n.id)}
                                    >
                                      <span />
                                    </div>
                                    {editingNote?.noteId === n.id ? (
                                      <div className="note-editing">
                                        <input
                                          className="edit-input"
                                          value={editingNote.content}
                                          onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveEditNote(task.id)
                                            if (e.key === 'Escape') setEditingNote(null)
                                          }}
                                          autoFocus
                                        />
                                        <div className="note-edit-actions">
                                          <button className="small-button" onClick={() => saveEditNote(task.id)}>
                                            Save
                                          </button>
                                          <button className="small-button" onClick={() => setEditingNote(null)}>
                                            Cancel
                                          </button>
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

          <CalendarPanel isOpen={isCalendarOpen} onToggle={() => setIsCalendarOpen((prev) => !prev)} tasks={tasks} />
        </div>
      )}
      {noteModal.taskId && (
        <div className="modal-backdrop">
          <div className="modal-card no-drag">
            <h4>Add note</h4>
            <textarea
              className="modal-textarea"
              rows={4}
              value={noteModal.text}
              onChange={(e) => setNoteModal((p) => ({ ...p, text: e.target.value }))}
              placeholder="Note"
            />
            <div className="modal-actions">
              <button className="button" onClick={submitNoteModal}>
                Save
              </button>
              <button className="small-button" onClick={() => setNoteModal({ taskId: null, text: '' })}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSignIn && (
        <div data-testid="signin-modal" className="modal-backdrop">
          <div className="modal-card no-drag">
            <h4>Sign in to sync</h4>
            <input
              className="edit-input"
              type="email"
              placeholder="Email"
              value={signInForm.email}
              onChange={(e) => setSignInForm((p) => ({ ...p, email: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            />
            <input
              className="edit-input"
              type="password"
              placeholder="Password"
              value={signInForm.password}
              onChange={(e) => setSignInForm((p) => ({ ...p, password: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            />
            {signInError && <p className="sign-in-error">{signInError}</p>}
            <div className="modal-actions">
              <button className="button" onClick={handleSignIn} disabled={signingIn}>
                {signingIn ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                data-testid="btn-signin-skip"
                className="small-button"
                onClick={() => setShowSignIn(false)}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resize grip for frameless window */}
      {!isMinimized && (
        <div
          className="resize-grip no-drag"
          onMouseDown={(e: ReactMouseEvent) => {
            e.preventDefault()
            e.stopPropagation()

            // Track position per-frame to handle both grow and shrink
            let prevX = e.screenX
            let prevY = e.screenY
            let rafId: number | null = null
            let pendingDeltaX = 0
            let pendingDeltaY = 0

            const applyResize = () => {
              if (pendingDeltaX !== 0 || pendingDeltaY !== 0) {
                window.toodoo.resizeWindow(pendingDeltaX, pendingDeltaY)
                pendingDeltaX = 0
                pendingDeltaY = 0
              }
              rafId = null
            }

            const onMouseMove = (moveEvent: MouseEvent) => {
              // Accumulate deltas between frames
              pendingDeltaX += moveEvent.screenX - prevX
              pendingDeltaY += moveEvent.screenY - prevY
              prevX = moveEvent.screenX
              prevY = moveEvent.screenY

              // Throttle to animation frames
              if (rafId === null) {
                rafId = requestAnimationFrame(applyResize)
              }
            }

            const onMouseUp = () => {
              if (rafId !== null) {
                cancelAnimationFrame(rafId)
                applyResize() // Apply any remaining delta
              }
              document.removeEventListener('mousemove', onMouseMove)
              document.removeEventListener('mouseup', onMouseUp)
            }

            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
          }}
        />
      )}
    </div>
  )
}

export default TooDooOverlay
