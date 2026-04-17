import React, { useCallback, useState } from 'react'
import { View, Text, StyleSheet, LayoutAnimation } from 'react-native'
import { NestableScrollContainer } from 'react-native-draggable-flatlist'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { Task, TaskCategory } from '@shared/types'
import type { RootStackParamList } from '../../app/RootNavigator'
import { useTaskStore } from '../../stores/taskStore'
import { useTaskSections } from '../../hooks/useTaskSections'
import { useDeleteArm } from '../../hooks/useDeleteArm'
import { useFontSize } from '../../hooks/useFontSize'
import { CategorySection } from '../../components/tasks/CategorySection'
import { type EditForm } from '../../components/tasks/TaskCardEditForm'
import { FAB } from '../../components/common/FAB'
import { SyncDot } from '../../components/common/SyncDot'
import { FontSizeControls } from '../../components/common/FontSizeControls'
import { CategoryMoveSheet } from '../../components/common/CategoryMoveSheet'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

export function TasksScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { sections, isScorchingMode, visibleCategories } = useTaskSections()
  const { fontSize } = useFontSize()

  // Task delete arm
  const { armedForDelete: taskArmed, armForDelete: armTask, disarmDelete: disarmTask } = useDeleteArm()
  // Project note delete arm
  const { armedForDelete: noteArmed, armForDelete: armNote, disarmDelete: disarmNote } = useDeleteArm()

  // Editing state (ephemeral, one task at a time)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)

  // Category move sheet
  const [moveTask, setMoveTask] = useState<Task | null>(null)

  const store = useTaskStore

  const handleEditStart = useCallback(
    (task: Task) => {
      setEditingTaskId(task.id)
      setEditForm({
        title: task.title,
        description: task.description ?? '',
        scheduledDate: task.scheduledDate ? new Date(task.scheduledDate) : null,
        scheduledTime: task.scheduledTime ?? '',
      })
    },
    [],
  )

  const handleEditSave = useCallback(() => {
    if (!editingTaskId || !editForm) return

    let dateMs: number | null = null
    if (editForm.scheduledDate) {
      const d = new Date(editForm.scheduledDate)
      d.setHours(0, 0, 0, 0)
      dateMs = d.getTime()
    }

    store.getState().updateTask({
      id: editingTaskId,
      title: editForm.title,
      description: editForm.description || null,
      scheduledDate: dateMs,
      scheduledTime: dateMs && editForm.scheduledTime ? editForm.scheduledTime : null,
    })
    setEditingTaskId(null)
    setEditForm(null)
  }, [editingTaskId, editForm, store])

  const handleEditCancel = useCallback(() => {
    setEditingTaskId(null)
    setEditForm(null)
  }, [])

  const handleDeletePress = useCallback(
    (taskId: string) => {
      if (taskArmed.has(taskId)) {
        disarmTask(taskId)
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        store.getState().deleteTask(taskId)
      } else {
        armTask(taskId)
      }
    },
    [taskArmed, armTask, disarmTask, store],
  )

  const handleNoteDeletePress = useCallback(
    (noteId: string) => {
      if (noteArmed.has(noteId)) {
        disarmNote(noteId)
        store.getState().deleteProjectNote(noteId)
      } else {
        armNote(noteId)
      }
    },
    [noteArmed, armNote, disarmNote, store],
  )

  const handleNoteUpdate = useCallback(
    (noteId: string, content: string) => {
      store.getState().updateProjectNote(noteId, content)
    },
    [store],
  )

  const handleNoteAdd = useCallback(
    (taskId: string, content: string) => {
      if (content) {
        store.getState().addProjectNote(taskId, content)
      }
    },
    [store],
  )

  const handleReorder = useCallback(
    (taskId: string, toIndex: number) => {
      store.getState().reorderTask(taskId, toIndex)
    },
    [store],
  )

  const handleCategoryMove = useCallback(
    (taskId: string, category: TaskCategory) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      store.getState().updateTask({ id: taskId, category })
    },
    [store],
  )

  const totalTasks = visibleCategories.reduce((sum, cat) => sum + sections[cat.key].length, 0)

  return (
    <View style={styles.container}>
      <NestableScrollContainer style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        {isScorchingMode && (
          <View style={styles.scorchingBanner}>
            <Text style={styles.scorchingText}>Scorching mode active</Text>
          </View>
        )}
        {totalTasks === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tasks yet</Text>
            <Text style={styles.emptyHint}>Tap + to add your first task</Text>
          </View>
        ) : (
          visibleCategories.map((cat) => (
            <CategorySection
              key={cat.key}
              category={cat}
              tasks={sections[cat.key]}
              editingTaskId={editingTaskId}
              editForm={editForm}
              onEditStart={handleEditStart}
              onEditChange={setEditForm}
              onEditSave={handleEditSave}
              onEditCancel={handleEditCancel}
              onReorder={handleReorder}
              onLongPress={(task) => setMoveTask(task)}
              armedForDelete={taskArmed}
              onDeletePress={handleDeletePress}
              noteArmedForDelete={noteArmed}
              onNoteDeletePress={handleNoteDeletePress}
              onNoteUpdate={handleNoteUpdate}
              onNoteAdd={handleNoteAdd}
              fontSize={fontSize}
            />
          ))
        )}
      </NestableScrollContainer>

      <FAB onPress={() => navigation.navigate('QuickAdd', {})} />

      <CategoryMoveSheet
        visible={!!moveTask}
        task={moveTask}
        onSelect={handleCategoryMove}
        onClose={() => setMoveTask(null)}
      />
    </View>
  )
}

TasksScreen.options = {
  headerLeft: () => <SyncDot />,
  headerRight: () => <FontSizeControls />,
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: spacing.lg,
    paddingBottom: 80,
  },
  scorchingBanner: {
    backgroundColor: 'rgba(245, 245, 245, 0.06)',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  scorchingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textDim,
  },
})
