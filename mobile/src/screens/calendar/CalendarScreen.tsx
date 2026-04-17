import React, { useCallback, useMemo, useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { CalendarStackParamList } from '../../app/CalendarStack'
import { useTaskStore } from '../../stores/taskStore'
import { CalendarHeader } from '../../components/calendar/CalendarHeader'
import { CalendarGrid } from '../../components/calendar/CalendarGrid'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

export function CalendarScreen() {
  const navigation = useNavigation<StackNavigationProp<CalendarStackParamList>>()
  const tasks = useTaskStore((s) => s.tasks)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  // Dynamic bounds: current year -1 to +2, expanding if tasks exist outside that range
  const currentYear = now.getFullYear()
  const defaultMin = currentYear - 1
  const defaultMax = currentYear + 2

  const { minYear, maxYear } = useMemo(() => {
    let min = defaultMin
    let max = defaultMax
    for (const t of tasks) {
      if (t.scheduledDate && !t.deletedAt) {
        const y = new Date(t.scheduledDate).getFullYear()
        if (y < min) min = y
        if (y > max) max = y
      }
    }
    return { minYear: min, maxYear: max }
  }, [tasks, defaultMin, defaultMax])

  const canGoPrev = year > minYear || (year === minYear && month > 1)
  const canGoNext = year < maxYear || (year === maxYear && month < 12)

  const goToPrev = () => {
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
    } else {
      setMonth(month - 1)
    }
  }

  const goToNext = () => {
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(month + 1)
    }
  }

  const handleDayPress = useCallback(
    (date: Date) => {
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      navigation.navigate('CalendarDay', { dateMs: d.getTime() })
    },
    [navigation],
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <CalendarHeader
        year={year}
        month={month}
        onPrev={goToPrev}
        onNext={goToNext}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
      />
      <View style={styles.gridContainer}>
        <CalendarGrid year={year} month={month} tasks={tasks} onDayPress={handleDayPress} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
  },
  gridContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: spacing.sm,
  },
})
