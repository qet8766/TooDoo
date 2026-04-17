import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { Task } from '@shared/types'
import { getHoliday, formatDateStr } from '@shared/holidays'
import { CalendarDay } from './CalendarDay'
import { colors } from '../../theme/colors'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

type Props = {
  year: number
  month: number
  tasks: Task[]
  onDayPress: (date: Date) => void
}

export function CalendarGrid({ year, month, tasks, onDayPress }: Props) {
  const { days, tasksByDate, todayStr } = useMemo(() => {
    // Build day cells (null = empty padding)
    const firstDay = new Date(year, month - 1, 1)
    const startDayOfWeek = firstDay.getDay()
    const daysInMonth = new Date(year, month, 0).getDate()

    const cells: (Date | null)[] = []
    for (let i = 0; i < startDayOfWeek; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d))

    // Build tasks-by-date map
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.scheduledDate || task.deletedAt) continue
      const d = new Date(task.scheduledDate)
      const key = formatDateStr(d)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(task)
    }

    const now = new Date()
    const today = formatDateStr(now)

    return { days: cells, tasksByDate: map, todayStr: today }
  }, [year, month, tasks])

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((label, i) => (
          <View key={label} style={styles.weekdayCell}>
            <Text
              style={[
                styles.weekdayText,
                i === 0 && styles.sundayText,
                i === 6 && styles.saturdayText,
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {days.map((date, i) => {
          const dateStr = date ? formatDateStr(date) : ''
          return (
            <CalendarDay
              key={date ? dateStr : `empty-${i}`}
              date={date}
              tasks={date ? tasksByDate.get(dateStr) ?? [] : []}
              isToday={dateStr === todayStr}
              holiday={date ? getHoliday(dateStr) : undefined}
              onPress={onDayPress}
            />
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    width: '14.285%' as unknown as number,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sundayText: {
    color: colors.error,
  },
  saturdayText: {
    color: colors.accentBlue,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
