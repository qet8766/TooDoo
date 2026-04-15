/**
 * D-day marker calculation for timed tasks
 *
 * Returns labels like D-7, D-1, D-Day, D+1, D+3 based on
 * calendar-day distance between today and the scheduled date.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Calculate D-day marker string for a scheduled date.
 *
 * Uses calendar days (midnight-to-midnight), not hours.
 * - D-7 = 7 days before the deadline
 * - D-Day = the deadline day
 * - D+3 = 3 days overdue
 */
export const calculateDDay = (scheduledDate: number, now: number = Date.now()): string => {
  const target = new Date(scheduledDate)
  target.setHours(0, 0, 0, 0)

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const diffDays = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY)

  if (diffDays === 0) return 'D-Day'
  if (diffDays > 0) return `D-${diffDays}`
  return `D+${Math.abs(diffDays)}`
}

/**
 * Determine the urgency class for a D-day marker.
 * - 'overdue' when past deadline
 * - 'today' on the deadline day
 * - undefined otherwise (upcoming)
 */
export const getDDayUrgency = (scheduledDate: number, now: number = Date.now()): string | undefined => {
  const target = new Date(scheduledDate)
  target.setHours(0, 0, 0, 0)

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const diffDays = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY)

  if (diffDays === 0) return 'today'
  if (diffDays < 0) return 'overdue'
  return undefined
}
