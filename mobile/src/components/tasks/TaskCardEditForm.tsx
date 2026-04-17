import React, { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'
import type { EditForm } from '../../stores/taskInteractionStore'

export type { EditForm }

type Props = {
  form: EditForm
  onChange: (form: EditForm) => void
  onSave: () => void
  onCancel: () => void
  isTimed: boolean
  fontSize: number
}

export function TaskCardEditForm({ form, onChange, onSave, onCancel, isTimed, fontSize }: Props) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios')
    if (date) {
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      onChange({ ...form, scheduledDate: d })
    }
  }

  const handleTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowTimePicker(Platform.OS === 'ios')
    if (date) {
      const hh = String(date.getHours()).padStart(2, '0')
      const mm = String(date.getMinutes()).padStart(2, '0')
      onChange({ ...form, scheduledTime: `${hh}:${mm}` })
    }
  }

  const timeAsDate = (): Date => {
    const d = new Date()
    if (form.scheduledTime) {
      const [hh, mm] = form.scheduledTime.split(':')
      d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0)
    }
    return d
  }

  const formatDate = (d: Date) =>
    d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, { fontSize }]}
        value={form.title}
        onChangeText={(title) => onChange({ ...form, title })}
        placeholder="Title"
        placeholderTextColor={colors.textDim}
        autoFocus
      />
      <TextInput
        style={[styles.input, styles.multiline, { fontSize: fontSize - 1 }]}
        value={form.description}
        onChangeText={(description) => onChange({ ...form, description })}
        placeholder="Description (optional)"
        placeholderTextColor={colors.textDim}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />
      {isTimed && (
        <View style={styles.scheduleRow}>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.scheduleBtn}>
            <Text style={styles.scheduleBtnText}>
              {form.scheduledDate ? formatDate(form.scheduledDate) : 'Set date'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.scheduleBtn}>
            <Text style={styles.scheduleBtnText}>{form.scheduledTime || 'Set time'}</Text>
          </TouchableOpacity>
          {(form.scheduledDate || form.scheduledTime) && (
            <TouchableOpacity
              onPress={() => onChange({ ...form, scheduledDate: null, scheduledTime: '' })}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {showDatePicker && (
        <DateTimePicker
          value={form.scheduledDate ?? new Date()}
          mode="date"
          onChange={handleDateChange}
        />
      )}
      {showTimePicker && (
        <DateTimePicker value={timeAsDate()} mode="time" is24Hour onChange={handleTimeChange} />
      )}
      <View style={styles.actions}>
        <TouchableOpacity onPress={onSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  input: {
    color: colors.text,
    backgroundColor: colors.bgInput,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: {
    minHeight: 60,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scheduleBtn: {
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
  },
  scheduleBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  clearBtnText: {
    fontSize: 12,
    color: colors.error,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 6,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.bg,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelBtnText: {
    fontSize: 13,
    color: colors.textMuted,
  },
})
