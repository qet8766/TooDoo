import { useState, type FormEvent } from 'react'
import type { Task } from '@shared/types'
import { CATEGORIES } from '@shared/categories'
import { getHoliday, formatDateStr } from '@shared/holidays'
import './CalendarTaskModal.css'

interface CalendarTaskModalProps {
  date: Date
  tasks: Task[]
  onClose: () => void
}

export const CalendarTaskModal = ({ date, tasks, onClose }: CalendarTaskModalProps) => {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const dateStr = formatDateStr(date)
  const holiday = getHoliday(dateStr)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setStatus('Title required')
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      setStatus('Adding...')

      // Create timestamp for the scheduled date (midnight local time)
      const scheduledDate = new Date(date)
      scheduledDate.setHours(0, 0, 0, 0)

      const payload = {
        id: crypto.randomUUID(),
        title: trimmed,
        category: 'cool' as const,  // Always cool - will auto-promote based on date
        scheduledDate: scheduledDate.getTime(),
        scheduledTime: time || undefined,
      }

      const result = await window.toodoo.tasks.add(payload)
      if (result && 'error' in result) {
        setStatus(`Error: ${result.error}`)
        setIsSubmitting(false)
        return
      }

      setStatus('Added!')
      setTitle('')
      setTime('')
      setTimeout(onClose, 400)
    } catch (err) {
      setStatus('Failed to add task')
      setIsSubmitting(false)
    }
  }

  const formatDateDisplay = (d: Date) => {
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="calendar-task-modal no-drag" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h4>{formatDateDisplay(date)}</h4>
          {holiday && (
            <span className={`holiday-badge ${holiday.isSubstitute ? 'substitute' : ''}`}>
              {holiday.name}
            </span>
          )}
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {tasks.length > 0 && (
          <div className="existing-tasks">
            <p className="section-label">Scheduled Tasks</p>
            {tasks.map(task => (
              <div key={task.id} className={`task-preview tone-${CATEGORIES[task.category].tone}`}>
                <span className="task-dot" />
                <span className="task-name">{task.title}</span>
                {task.scheduledTime && <span className="task-time">{task.scheduledTime}</span>}
              </div>
            ))}
          </div>
        )}

        <form className="add-task-form" onSubmit={handleSubmit}>
          <p className="section-label">Add New Task</p>

          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title"
            className="task-input"
            autoFocus
            maxLength={500}
          />

          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="time-input"
            title="Time (optional)"
            placeholder="Time (optional)"
          />

          <p className="category-hint">
            Priority auto-adjusts: cool → warm → hot → scorching as date approaches
          </p>

          <button
            type="submit"
            className="button add-btn"
            disabled={isSubmitting || !title.trim()}
          >
            Schedule Task
          </button>

          {status && <p className="status-text muted">{status}</p>}
        </form>
      </div>
    </div>
  )
}
