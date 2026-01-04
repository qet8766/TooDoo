import { useState } from 'react'
import type { Task } from '@shared/types'
import { formatDateStr } from '@shared/holidays'
import { Calendar } from './Calendar'
import { CalendarTaskModal } from './CalendarTaskModal'
import './CalendarPanel.css'

interface CalendarPanelProps {
  isOpen: boolean
  onToggle: () => void
  tasks: Task[]
}

export const CalendarPanel = ({ isOpen, onToggle, tasks }: CalendarPanelProps) => {
  const today = new Date()
  const [year, setYear] = useState(() => {
    // Start with current year if within 2026-2027, otherwise 2026
    const currentYear = today.getFullYear()
    return currentYear >= 2026 && currentYear <= 2027 ? currentYear : 2026
  })
  const [month, setMonth] = useState(() => {
    const currentYear = today.getFullYear()
    return currentYear >= 2026 && currentYear <= 2027 ? today.getMonth() + 1 : 1
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Filter to only scheduled tasks (not deleted)
  const scheduledTasks = tasks.filter(t => t.scheduledDate && !t.isDeleted)

  const handleMonthChange = (newYear: number, newMonth: number) => {
    // Limit to 2026-2027
    if (newYear < 2026 || newYear > 2027) return
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
  }

  const handleCloseModal = () => {
    setSelectedDate(null)
  }

  // Get tasks for selected date
  const tasksForSelectedDate = selectedDate
    ? scheduledTasks.filter(t => {
        if (!t.scheduledDate) return false
        const taskDate = formatDateStr(new Date(t.scheduledDate))
        const selectedStr = formatDateStr(selectedDate)
        return taskDate === selectedStr
      })
    : []

  if (!isOpen) {
    return (
      <button
        className="calendar-toggle-btn collapsed no-drag"
        onClick={onToggle}
        title="Open Calendar"
      >
        <span className="toggle-icon">Cal</span>
      </button>
    )
  }

  return (
    <div className="calendar-panel no-drag">
      <div className="calendar-panel-header">
        <span className="panel-title">Calendar</span>
        <button
          className="calendar-close-btn"
          onClick={onToggle}
          title="Close Calendar"
        >
          &times;
        </button>
      </div>

      <Calendar
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        onDateClick={handleDateClick}
        scheduledTasks={scheduledTasks}
      />

      {selectedDate && (
        <CalendarTaskModal
          date={selectedDate}
          tasks={tasksForSelectedDate}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
