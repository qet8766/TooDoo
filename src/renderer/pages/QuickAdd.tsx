import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import type { Task, TaskCategory } from '@shared/types'
import { ALL_CATEGORIES, CATEGORIES } from '@shared/categories'

const isValidCategory = (cat: string | null): cat is TaskCategory => {
  return cat !== null && ALL_CATEGORIES.includes(cat as TaskCategory)
}

const QuickAdd = () => {
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const rawCategory = params.get('category')
  const category: TaskCategory = isValidCategory(rawCategory) ? rawCategory : 'hot'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setStatus('Title is required')
      return
    }

    if (trimmed.length > 500) {
      setStatus('Title too long (max 500 characters)')
      return
    }

    const descTrimmed = description.trim()
    if (descTrimmed.length > 5000) {
      setStatus('Description too long (max 5000 characters)')
      return
    }

    const payload: Task = {
      id: crypto.randomUUID(),
      title: trimmed,
      description: descTrimmed || undefined,
      category,
      isDone: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    }

    try {
      setStatus('Adding...')
      const result = await window.toodoo.tasks.add(payload)
      // Check if result is an error object
      if (result && 'error' in result) {
        setStatus(`Failed: ${result.error}`)
        return
      }
      setStatus('Added!')
      // Await the delay before closing (no race condition)
      await new Promise(resolve => setTimeout(resolve, 300))
      window.close()
    } catch (error) {
      console.error('Failed to add task from quick-add', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatus(`Failed: ${message}`)
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
