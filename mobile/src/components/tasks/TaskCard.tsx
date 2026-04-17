import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import type { Task } from '@shared/types'
import { DeleteCheckbox } from './DeleteCheckbox'
import { DDayBadge } from './DDayBadge'
import { TaskCardEditForm, type EditForm } from './TaskCardEditForm'
import { ProjectNotesList } from './ProjectNotesList'
import { toneColors } from '../../theme/tones'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = {
  task: Task
  isEditing: boolean
  editForm: EditForm | null
  onEditStart: () => void
  onEditChange: (form: EditForm) => void
  onEditSave: () => void
  onEditCancel: () => void
  // Delete
  isArmedForDelete: boolean
  onDeletePress: () => void
  // Drag (only for heat categories)
  drag?: () => void
  isActive?: boolean
  // Long-press for category move
  onLongPress: () => void
  // Project notes
  noteArmedForDelete: Set<string>
  onNoteDeletePress: (noteId: string) => void
  onNoteUpdate: (noteId: string, content: string) => void
  onNoteAdd: (taskId: string, content: string) => void
  // Settings
  fontSize: number
}

export function TaskCard({
  task,
  isEditing,
  editForm,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  isArmedForDelete,
  onDeletePress,
  drag,
  isActive,
  onLongPress,
  noteArmedForDelete,
  onNoteDeletePress,
  onNoteUpdate,
  onNoteAdd,
  fontSize,
}: Props) {
  const tone = toneColors[task.category]
  const isTimed = task.category === 'timed'

  const formatSchedule = () => {
    if (!task.scheduledDate) return null
    const d = new Date(task.scheduledDate)
    const dateStr = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    return task.scheduledTime ? `${dateStr} ${task.scheduledTime}` : dateStr
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tone.bg, borderLeftColor: tone.dot },
        isActive && styles.dragging,
      ]}
    >
      <View style={styles.row}>
        <DeleteCheckbox isArmed={isArmedForDelete} onPress={onDeletePress} />

        {isEditing && editForm ? (
          <View style={styles.editArea}>
            <TaskCardEditForm
              form={editForm}
              onChange={onEditChange}
              onSave={onEditSave}
              onCancel={onEditCancel}
              isTimed={isTimed}
              fontSize={fontSize}
            />
          </View>
        ) : (
          <Pressable onPress={onEditStart} onLongPress={onLongPress} style={styles.contentArea}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { fontSize }]} numberOfLines={2}>
                {task.title}
              </Text>
              {isTimed && task.scheduledDate && <DDayBadge scheduledDate={task.scheduledDate} />}
            </View>
            {task.description ? (
              <Text style={[styles.description, { fontSize: fontSize - 2 }]} numberOfLines={1}>
                {task.description}
              </Text>
            ) : null}
            {isTimed && formatSchedule() && (
              <Text style={styles.schedule}>{formatSchedule()}</Text>
            )}
          </Pressable>
        )}

        {drag && !isEditing && (
          <Pressable onPressIn={drag} hitSlop={8} style={styles.dragHandle}>
            <MaterialCommunityIcons name="drag-vertical" size={20} color={colors.textDim} />
          </Pressable>
        )}
      </View>

      {isTimed && !isEditing && (
        <ProjectNotesList
          notes={task.projectNotes ?? []}
          taskId={task.id}
          armedForDelete={noteArmedForDelete}
          onDeletePress={onNoteDeletePress}
          onUpdate={onNoteUpdate}
          onAdd={onNoteAdd}
          fontSize={fontSize}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dragging: {
    opacity: 0.8,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  contentArea: {
    flex: 1,
  },
  editArea: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontWeight: '600',
    color: colors.textBright,
    flex: 1,
  },
  description: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  schedule: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 4,
  },
  dragHandle: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
})
