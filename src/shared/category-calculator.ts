/**
 * Dynamic category calculation for scheduled tasks
 *
 * Rules:
 * - Far away (default): Cool
 * - Within 1 week: Warm
 * - Within 24 hours (time specified) OR on the date (date only): Hot
 * - Within 1 hour (time specified) OR overdue: Scorching
 *
 * Project tasks are excluded from auto-promotion.
 */

import type { Task, TaskCategory } from './types'

// Time constants in milliseconds
const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS
const ONE_WEEK_MS = 7 * ONE_DAY_MS

// Category types that can be auto-promoted (excludes 'project')
export type PromotableCategory = 'scorching' | 'hot' | 'warm' | 'cool'

/**
 * Calculate effective category based on scheduled date/time proximity
 *
 * @param scheduledDate - Unix timestamp of the scheduled date (midnight)
 * @param scheduledTime - Optional time in "HH:MM" format
 * @param now - Current timestamp (defaults to Date.now())
 * @returns The effective category based on time proximity
 */
export const calculateEffectiveCategory = (
  scheduledDate: number,
  scheduledTime: string | undefined,
  now: number = Date.now()
): PromotableCategory => {
  let targetTimestamp: number

  if (scheduledTime) {
    // Time is specified - calculate exact target moment
    const [hours, minutes] = scheduledTime.split(':').map(Number)
    const date = new Date(scheduledDate)
    date.setHours(hours, minutes, 0, 0)
    targetTimestamp = date.getTime()
  } else {
    // No time specified - use end of day (23:59:59.999)
    const date = new Date(scheduledDate)
    date.setHours(23, 59, 59, 999)
    targetTimestamp = date.getTime()
  }

  const msRemaining = targetTimestamp - now

  // Already past (overdue) - treat as scorching
  if (msRemaining < 0) {
    return 'scorching'
  }

  // Within 1 hour (only if time is specified)
  if (scheduledTime && msRemaining <= ONE_HOUR_MS) {
    return 'scorching'
  }

  // Within 24 hours (if time specified)
  if (scheduledTime && msRemaining <= ONE_DAY_MS) {
    return 'hot'
  }

  // Same calendar day (if date only, no time)
  if (!scheduledTime) {
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const scheduledDateStart = new Date(scheduledDate)
    scheduledDateStart.setHours(0, 0, 0, 0)

    if (todayStart.getTime() === scheduledDateStart.getTime()) {
      return 'hot'
    }
  }

  // Within 1 week
  if (msRemaining <= ONE_WEEK_MS) {
    return 'warm'
  }

  // Far away - default
  return 'cool'
}

/**
 * Determine if a task needs its category recalculated
 *
 * @param task - The task to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns True if the task's category needs updating
 */
export const needsCategoryUpdate = (task: Task, now: number = Date.now()): boolean => {
  // No scheduled date - no auto-promotion
  if (!task.scheduledDate) return false

  // User manually promoted this task - skip auto-updates
  if (task.userPromoted) return false

  // Project tasks never auto-promote
  if (task.baseCategory === 'project' || (!task.baseCategory && task.category === 'project')) {
    return false
  }

  // Completed tasks don't need updating
  if (task.isDone) return false

  const newCategory = calculateEffectiveCategory(
    task.scheduledDate,
    task.scheduledTime,
    now
  )

  return task.category !== newCategory
}

/**
 * Get all tasks that need category updates
 *
 * @param tasks - Array of tasks to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Array of tasks that need updating
 */
export const getTasksNeedingUpdate = (tasks: Task[], now: number = Date.now()): Task[] => {
  return tasks.filter(task => needsCategoryUpdate(task, now))
}

/**
 * Calculate the new category for a task, respecting project exclusion
 *
 * @param task - The task to calculate for
 * @param now - Current timestamp
 * @returns The new category, or undefined if no change needed
 */
export const getUpdatedCategory = (
  task: Task,
  now: number = Date.now()
): TaskCategory | undefined => {
  if (!needsCategoryUpdate(task, now)) return undefined

  return calculateEffectiveCategory(
    task.scheduledDate!,
    task.scheduledTime,
    now
  )
}
