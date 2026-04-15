import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import type { TaskCategory } from '@shared/types'
import { ALL_CATEGORIES, CATEGORIES } from '@shared/categories'
import { LIMITS } from '@shared/validation'

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
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [status, setStatus] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)
  const isTimed = category === 'timed'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setStatus('Title is required')
      return
    }

    if (trimmed.length > LIMITS.TASK_TITLE_MAX) {
      setStatus(`Title too long (max ${LIMITS.TASK_TITLE_MAX} characters)`)
      return
    }

    const descTrimmed = description.trim()
    if (descTrimmed.length > LIMITS.TASK_DESCRIPTION_MAX) {
      setStatus(`Description too long (max ${LIMITS.TASK_DESCRIPTION_MAX} characters)`)
      return
    }

    // Build scheduled date timestamp if provided
    let scheduledDateTs: number | undefined
    if (scheduledDate) {
      const date = new Date(scheduledDate)
      date.setHours(0, 0, 0, 0)
      scheduledDateTs = date.getTime()
    }

    const payload = {
      id: crypto.randomUUID(),
      title: trimmed,
      description: descTrimmed || undefined,
      category,
      isDone: false,
      scheduledDate: scheduledDateTs,
      scheduledTime: scheduledTime || undefined,
    }

    try {
      setStatus('Adding...')
      const result = await window.toodoo.tasks.add(payload)
      if (!result.success) {
        setStatus(`Failed: ${result.error}`)
        return
      }
      setStatus('Added!')
      // Await the delay before closing (no race condition)
      await new Promise((resolve) => setTimeout(resolve, 300))
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
        {isTimed && (
          <div className="quick-add-schedule">
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="no-drag"
              title="Schedule date"
            />
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="no-drag"
              title="Time (optional)"
            />
          </div>
        )}
        <button className="button" type="submit">
          Add {CATEGORIES[category].title}
        </button>
      </form>

      {status && <p className="muted status-text">{status}</p>}
    </div>
  )
}

export default QuickAdd
