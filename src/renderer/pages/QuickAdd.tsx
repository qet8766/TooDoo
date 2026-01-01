import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import type { Task, TaskCategory } from '@shared/types'
import { CATEGORIES } from '@shared/categories'

const QuickAdd = () => {
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const category = (params.get('category') as TaskCategory) || 'short_term'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    const payload: Task = {
      id: crypto.randomUUID(),
      title: trimmed,
      description: description.trim() || undefined,
      category,
      isDone: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    }

    try {
      await window.toodoo.tasks.add(payload)
      setStatus('Added!')
      window.close()
    } catch (error) {
      console.error('Failed to add task from quick-add', error)
      setStatus('Failed to add task')
    }
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  return (
    <div className="quick-add-shell">
      <div className="quick-add-header">
        <div>
          <p className="muted">Quick add</p>
          <h3>{CATEGORIES[category].title} task</h3>
        </div>
        <button className="small-button" type="button" onClick={() => window.close()}>
          Close
        </button>
      </div>

      <form ref={formRef} className="input-stack" onSubmit={handleSubmit}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="no-drag"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="no-drag"
          onKeyDown={handleTextareaKeyDown}
        />
        <button className="button" type="submit">
          Add {CATEGORIES[category].title}
        </button>
      </form>

      {status && <p className="muted status-text">{status}</p>}
    </div>
  )
}

export default QuickAdd
