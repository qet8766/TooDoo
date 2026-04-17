import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { NestableDraggableFlatList, type RenderItemParams } from 'react-native-draggable-flatlist'
import type { Task } from '@shared/types'
import type { CategoryConfig } from '@shared/categories'
import { TaskCard } from './TaskCard'
import { type EditForm } from './TaskCardEditForm'
import { toneColors } from '../../theme/tones'
import { spacing } from '../../theme/spacing'

type Props = {
  category: CategoryConfig
  tasks: Task[]
  editingTaskId: string | null
  editForm: EditForm | null
  onEditStart: (task: Task) => void
  onEditChange: (form: EditForm) => void
  onEditSave: () => void
  onEditCancel: () => void
  onReorder: (taskId: string, toIndex: number) => void
  onLongPress: (task: Task) => void
  // Delete
  armedForDelete: Set<string>
  onDeletePress: (taskId: string) => void
  // Project notes
  noteArmedForDelete: Set<string>
  onNoteDeletePress: (noteId: string) => void
  onNoteUpdate: (noteId: string, content: string) => void
  onNoteAdd: (taskId: string, content: string) => void
  fontSize: number
}

export function CategorySection({
  category,
  tasks,
  editingTaskId,
  editForm,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onReorder,
  onLongPress,
  armedForDelete,
  onDeletePress,
  noteArmedForDelete,
  onNoteDeletePress,
  onNoteUpdate,
  onNoteAdd,
  fontSize,
}: Props) {
  const tone = toneColors[category.key]
  const isTimed = category.key === 'timed'

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Task>) => (
    <TaskCard
      task={item}
      isEditing={editingTaskId === item.id}
      editForm={editingTaskId === item.id ? editForm : null}
      onEditStart={() => onEditStart(item)}
      onEditChange={onEditChange}
      onEditSave={onEditSave}
      onEditCancel={onEditCancel}
      isArmedForDelete={armedForDelete.has(item.id)}
      onDeletePress={() => onDeletePress(item.id)}
      drag={isTimed ? undefined : drag}
      isActive={isActive}
      onLongPress={() => onLongPress(item)}
      noteArmedForDelete={noteArmedForDelete}
      onNoteDeletePress={onNoteDeletePress}
      onNoteUpdate={onNoteUpdate}
      onNoteAdd={onNoteAdd}
      fontSize={fontSize}
    />
  )

  if (tasks.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: tone.dot }]} />
        <Text style={[styles.title, { color: tone.text }]}>{category.title}</Text>
        <View style={[styles.countPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.countText, { color: tone.text }]}>{tasks.length}</Text>
        </View>
      </View>
      <NestableDraggableFlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data, from, to }) => {
          if (from !== to) {
            onReorder(data[to].id, to)
          }
        }}
        scrollEnabled={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
})
