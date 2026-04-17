import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { Task } from '@shared/types'
import type { Holiday } from '@shared/holidays'
import { toneColors } from '../../theme/tones'
import { colors } from '../../theme/colors'

type Props = {
  date: Date | null
  tasks: Task[]
  isToday: boolean
  holiday: Holiday | undefined
  onPress: (date: Date) => void
}

const MAX_DOTS = 3

export function CalendarDay({ date, tasks, isToday, holiday, onPress }: Props) {
  if (!date) {
    return <View style={styles.cell} />
  }

  const dayOfWeek = date.getDay()
  const isRed = holiday || dayOfWeek === 0
  const isSaturday = dayOfWeek === 6

  const dayColor = isRed ? colors.error : isSaturday ? colors.accentBlue : colors.text

  const overflow = tasks.length - MAX_DOTS
  const visibleTasks = tasks.slice(0, MAX_DOTS)

  return (
    <Pressable
      onPress={() => onPress(date)}
      style={[styles.cell, isToday && styles.today, holiday && !isToday && styles.holiday]}
    >
      <Text style={[styles.dayNumber, { color: dayColor }]}>{date.getDate()}</Text>
      {visibleTasks.length > 0 && (
        <View style={styles.dotsRow}>
          {visibleTasks.map((task, i) => (
            <View
              key={task.id || i}
              style={[styles.dot, { backgroundColor: toneColors[task.category].dot }]}
            />
          ))}
          {overflow > 0 && <Text style={styles.overflow}>+{overflow}</Text>}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  cell: {
    width: '14.285%' as unknown as number,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  today: {
    backgroundColor: 'rgba(94, 234, 212, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.4)',
    borderRadius: 6,
  },
  holiday: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderRadius: 6,
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  overflow: {
    fontSize: 8,
    color: colors.textDim,
    marginLeft: 1,
  },
})
