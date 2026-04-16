import type { TaskCategory } from '@shared/types'

export const toneColors: Record<TaskCategory, { dot: string; text: string; bg: string }> = {
  scorching: { dot: '#f5f5f5', text: '#f5f5f5', bg: 'rgba(245, 245, 245, 0.08)' },
  hot: { dot: '#ef4444', text: '#f87171', bg: 'rgba(239, 68, 68, 0.08)' },
  warm: { dot: '#eab308', text: '#fbbf24', bg: 'rgba(234, 179, 8, 0.08)' },
  cool: { dot: '#3b82f6', text: '#60a5fa', bg: 'rgba(59, 130, 246, 0.08)' },
  timed: { dot: '#c084fc', text: '#c084fc', bg: 'rgba(192, 132, 252, 0.08)' },
} as const
