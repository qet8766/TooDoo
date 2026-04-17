import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import type { StackScreenProps } from '@react-navigation/stack'
import type { TaskCategory } from '@shared/types'
import type { RootStackParamList } from '../../app/RootNavigator'
import { useTaskStore } from '../../stores/taskStore'
import { CategoryPicker } from '../../components/tasks/CategoryPicker'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = StackScreenProps<RootStackParamList, 'QuickAdd'>

export function QuickAddScreen({ navigation, route }: Props) {
  const [category, setCategory] = useState<TaskCategory>(route.params?.category ?? 'hot')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null)
  const [scheduledTime, setScheduledTime] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isTimed = category === 'timed'

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios')
    if (date) {
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      setScheduledDate(d)
    }
  }

  const handleTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowTimePicker(Platform.OS === 'ios')
    if (date) {
      const hh = String(date.getHours()).padStart(2, '0')
      const mm = String(date.getMinutes()).padStart(2, '0')
      setScheduledTime(`${hh}:${mm}`)
    }
  }

  const handleSubmit = async () => {
    const trimmed = title.trim()
    if (!trimmed || isSubmitting) return
    setIsSubmitting(true)

    await useTaskStore.getState().addTask({
      title: trimmed,
      description: description.trim() || undefined,
      category,
      scheduledDate: scheduledDate ? scheduledDate.getTime() : undefined,
      scheduledTime: scheduledDate && scheduledTime ? scheduledTime : undefined,
    })

    navigation.goBack()
  }

  const formatDate = (d: Date) =>
    d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

  const timeAsDate = (): Date => {
    const d = new Date()
    if (scheduledTime) {
      const [hh, mm] = scheduledTime.split(':')
      d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0)
    }
    return d
  }

  return (
    <Pressable style={styles.backdrop} onPress={() => navigation.goBack()}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Quick Add</Text>

          <CategoryPicker selected={category} onSelect={setCategory} />

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor={colors.textDim}
            autoFocus
            maxLength={500}
          />

          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={5000}
          />

          {isTimed && (
            <View style={styles.scheduleRow}>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.scheduleBtn}>
                <Text style={styles.scheduleBtnText}>
                  {scheduledDate ? formatDate(scheduledDate) : 'Set date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.scheduleBtn}>
                <Text style={styles.scheduleBtnText}>{scheduledTime || 'Set time'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {showDatePicker && (
            <DateTimePicker
              value={scheduledDate ?? new Date()}
              mode="date"
              onChange={handleDateChange}
            />
          )}
          {showTimePicker && (
            <DateTimePicker value={timeAsDate()} mode="time" is24Hour onChange={handleTimeChange} />
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            style={[styles.submitBtn, !title.trim() && styles.submitBtnDisabled]}
            disabled={!title.trim() || isSubmitting}
          >
            <Text style={styles.submitBtnText}>{isSubmitting ? 'Adding...' : 'Add Task'}</Text>
          </TouchableOpacity>
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.xxl,
    paddingBottom: spacing.xxxl + spacing.lg,
    gap: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textDim,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textBright,
  },
  input: {
    color: colors.text,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scheduleBtn: {
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  scheduleBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.bg,
  },
})
