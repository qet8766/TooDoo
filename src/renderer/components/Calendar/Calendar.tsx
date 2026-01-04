import { useMemo } from 'react'
import type { Task } from '@shared/types'
import { getHoliday, formatDateStr } from '@shared/holidays'
import './Calendar.css'

interface CalendarProps {
  year: number
  month: number // 1-12
  onMonthChange: (year: number, month: number) => void
  onDateClick: (date: Date) => void
  scheduledTasks: Task[]
}

const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토']

export const Calendar = ({ year, month, onMonthChange, onDateClick, scheduledTasks }: CalendarProps) => {
  // Calculate calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []

    // Padding for first week
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month - 1, d))
    }

    return days
  }, [year, month])

  // Map tasks by date string for quick lookup
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    scheduledTasks.forEach(task => {
      if (!task.scheduledDate) return
      const dateStr = formatDateStr(new Date(task.scheduledDate))
      if (!map.has(dateStr)) map.set(dateStr, [])
      map.get(dateStr)!.push(task)
    })
    return map
  }, [scheduledTasks])

  const handlePrev = () => {
    // Limit navigation to 2026-2027
    if (year === 2026 && month === 1) return
    if (month === 1) {
      onMonthChange(year - 1, 12)
    } else {
      onMonthChange(year, month - 1)
    }
  }

  const handleNext = () => {
    // Limit navigation to 2026-2027
    if (year === 2027 && month === 12) return
    if (month === 12) {
      onMonthChange(year + 1, 1)
    } else {
      onMonthChange(year, month + 1)
    }
  }

  const today = new Date()
  const todayStr = formatDateStr(today)

  const canGoPrev = !(year === 2026 && month === 1)
  const canGoNext = !(year === 2027 && month === 12)

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button
          className={`calendar-nav ${!canGoPrev ? 'disabled' : ''}`}
          onClick={handlePrev}
          disabled={!canGoPrev}
        >
          &lt;
        </button>
        <span className="calendar-title">{year}. {month}</span>
        <button
          className={`calendar-nav ${!canGoNext ? 'disabled' : ''}`}
          onClick={handleNext}
          disabled={!canGoNext}
        >
          &gt;
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS_KR.map((day, i) => (
          <div
            key={day}
            className={`weekday ${i === 0 ? 'sunday' : i === 6 ? 'saturday' : ''}`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarDays.map((date, i) => {
          if (!date) {
            return <div key={`empty-${i}`} className="calendar-day empty" />
          }

          const dateStr = formatDateStr(date)
          const holiday = getHoliday(dateStr)
          const tasksOnDay = tasksByDate.get(dateStr) || []
          const isToday = dateStr === todayStr
          const dayOfWeek = date.getDay()

          return (
            <div
              key={dateStr}
              className={`calendar-day ${isToday ? 'today' : ''} ${holiday ? 'holiday' : ''} ${dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : ''}`}
              onClick={() => onDateClick(date)}
              title={holiday ? `${holiday.name} (${holiday.nameEn})` : undefined}
            >
              <span className="day-number">{date.getDate()}</span>
              {tasksOnDay.length > 0 && (
                <div className="task-dots">
                  {tasksOnDay.slice(0, 3).map(task => (
                    <span key={task.id} className={`task-dot tone-${task.category}`} />
                  ))}
                  {tasksOnDay.length > 3 && (
                    <span className="task-more">+{tasksOnDay.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
