import React, { useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import type { StackScreenProps } from '@react-navigation/stack'
import type { Task } from '@shared/types'
import { formatDateStr, getHoliday } from '@shared/holidays'
import type { CalendarStackParamList } from '../../app/CalendarStack'
import { useTaskStore } from '../../stores/taskStore'
import { handleResult } from '../../lib/showError'
import { HolidayBadge } from '../../components/calendar/HolidayBadge'
import { toneColors } from '../../theme/tones'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = StackScreenProps<CalendarStackParamList, 'CalendarDay'>

export function CalendarDayScreen({ route, navigation }: Props) {
  const dateMs = route.params.dateMs
  const date = useMemo(() => new Date(dateMs), [dateMs])
  const dateStr = formatDateStr(date)
  const holiday = getHoliday(dateStr)
  const tasks = useTaskStore((s) => s.tasks)

  const [title, setTitle] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Set nav header title to formatted date
  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: date.toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      }),
    })
  }, [navigation, date])

  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.deletedAt && t.scheduledDate)
        .filter((t) => formatDateStr(new Date(t.scheduledDate!)) === dateStr)
        .sort((a, b) => {
          // Sort by time (tasks with time first), then by sortOrder
          if (a.scheduledTime && !b.scheduledTime) return -1
          if (!a.scheduledTime && b.scheduledTime) return 1
          if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime)
          return a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
        }),
    [tasks, dateStr],
  )

  const handleTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(Platform.OS === 'ios')
    if (selected) {
      const hh = String(selected.getHours()).padStart(2, '0')
      const mm = String(selected.getMinutes()).padStart(2, '0')
      setScheduledTime(`${hh}:${mm}`)
    }
  }

  const handleSubmit = async () => {
    const trimmed = title.trim()
    if (!trimmed || isSubmitting) return
    setIsSubmitting(true)

    const res = await useTaskStore.getState().addTask({
      title: trimmed,
      category: 'timed',
      scheduledDate: date.getTime(),
      scheduledTime: scheduledTime || undefined,
    })

    if (handleResult(res) !== null) {
      setTitle('')
      setScheduledTime('')
    }
    setIsSubmitting(false)
  }

  const timeAsDate = (): Date => {
    const d = new Date()
    if (scheduledTime) {
      const [hh, mm] = scheduledTime.split(':')
      d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0)
    }
    return d
  }

  const renderTask = ({ item }: { item: Task }) => {
    const tone = toneColors[item.category]
    return (
      <View style={styles.taskRow}>
        <View style={[styles.taskDot, { backgroundColor: tone.dot }]} />
        <View style={styles.taskContent}>
          <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
          {item.scheduledTime && <Text style={styles.taskTime}>{item.scheduledTime}</Text>}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {holiday && (
        <View style={styles.holidayContainer}>
          <HolidayBadge holiday={holiday} />
        </View>
      )}

      <FlatList
        data={dayTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No tasks scheduled</Text>
        }
      />

      <View style={styles.addForm}>
        <Text style={styles.addFormTitle}>Schedule a task</Text>
        <View style={styles.addFormRow}>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor={colors.textDim}
            maxLength={500}
          />
          <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.timeBtn}>
            <Text style={styles.timeBtnText}>{scheduledTime || 'Time'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={handleSubmit}
          style={[styles.submitBtn, !title.trim() && styles.submitBtnDisabled]}
          disabled={!title.trim() || isSubmitting}
        >
          <Text style={styles.submitBtnText}>{isSubmitting ? 'Adding...' : 'Add'}</Text>
        </TouchableOpacity>
        {showTimePicker && (
          <DateTimePicker value={timeAsDate()} mode="time" is24Hour onChange={handleTimeChange} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  holidayContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
    paddingTop: spacing.xxl,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskTitle: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  taskTime: {
    fontSize: 13,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  addForm: {
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  addFormTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  addFormRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  titleInput: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  timeBtn: {
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    justifyContent: 'center',
  },
  timeBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bg,
  },
})
