import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, LayoutAnimation } from 'react-native'
import { NestableScrollContainer } from 'react-native-draggable-flatlist'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { Task, TaskCategory } from '@shared/types'
import type { RootStackParamList } from '../../app/RootNavigator'
import { useTaskStore } from '../../stores/taskStore'
import { useTaskInteractionStore } from '../../stores/taskInteractionStore'
import { useTaskSections } from '../../hooks/useTaskSections'
import { useFontSize } from '../../hooks/useFontSize'
import { CategorySection } from '../../components/tasks/CategorySection'
import { FAB } from '../../components/common/FAB'
import { SyncDot } from '../../components/common/SyncDot'
import { FontSizeControls } from '../../components/common/FontSizeControls'
import { CategoryMoveSheet } from '../../components/common/CategoryMoveSheet'
import { handleResult } from '../../lib/showError'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

export function TasksScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { sections, isScorchingMode, visibleCategories } = useTaskSections()
  const { fontSize } = useFontSize()

  const editingTaskId = useTaskInteractionStore((s) => s.editingTaskId)
  const editForm = useTaskInteractionStore((s) => s.editForm)
  const armedTasks = useTaskInteractionStore((s) => s.armedTasks)
  const armedNotes = useTaskInteractionStore((s) => s.armedNotes)
  const { startEdit, updateForm, cancelEdit, armOrConfirmTask, armOrConfirmNote, disarmAll } =
    useTaskInteractionStore.getState()

  // Clear transient interaction state when the screen unmounts.
  useEffect(() => disarmAll, [disarmAll])

  // Category move sheet
  const [moveTask, setMoveTask] = useState<Task | null>(null)

  const store = useTaskStore

  const handleEditStart = useCallback(
    (task: Task) => {
      startEdit(task.id, {
        title: task.title,
        description: task.description ?? '',
        scheduledDate: task.scheduledDate ? new Date(task.scheduledDate) : null,
        scheduledTime: task.scheduledTime ?? '',
      })
    },
    [startEdit],
  )

  const handleEditSave = useCallback(async () => {
    const { editingTaskId: id, editForm: form } = useTaskInteractionStore.getState()
    if (!id || !form) return

    let dateMs: number | null = null
    if (form.scheduledDate) {
      const d = new Date(form.scheduledDate)
      d.setHours(0, 0, 0, 0)
      dateMs = d.getTime()
    }

    const res = await store.getState().updateTask({
      id,
      title: form.title,
      description: form.description || null,
      scheduledDate: dateMs,
      scheduledTime: dateMs && form.scheduledTime ? form.scheduledTime : null,
    })
    if (handleResult(res) === null) return
    cancelEdit()
  }, [store, cancelEdit])

  const handleDeletePress = useCallback(
    (taskId: string) => {
      if (armOrConfirmTask(taskId)) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        store.getState().deleteTask(taskId)
      }
    },
    [armOrConfirmTask, store],
  )

  const handleNoteDeletePress = useCallback(
    (noteId: string) => {
      if (armOrConfirmNote(noteId)) {
        store.getState().deleteProjectNote(noteId)
      }
    },
    [armOrConfirmNote, store],
  )

  const handleNoteUpdate = useCallback(
    async (noteId: string, content: string) => {
      handleResult(await store.getState().updateProjectNote(noteId, content))
    },
    [store],
  )

  const handleNoteAdd = useCallback(
    async (taskId: string, content: string) => {
      if (!content) return
      handleResult(await store.getState().addProjectNote(taskId, content))
    },
    [store],
  )

  const handleReorder = useCallback(
    (taskId: string, toIndex: number) => {
      // reorderTask returns boolean (desktop parity); no toast surface.
      void store.getState().reorderTask(taskId, toIndex)
    },
    [store],
  )

  const handleCategoryMove = useCallback(
    async (taskId: string, category: TaskCategory) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      handleResult(await store.getState().updateTask({ id: taskId, category }))
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
              onEditChange={updateForm}
              onEditSave={handleEditSave}
              onEditCancel={cancelEdit}
              onReorder={handleReorder}
              onLongPress={(task) => setMoveTask(task)}
              armedForDelete={armedTasks}
              onDeletePress={handleDeletePress}
              noteArmedForDelete={armedNotes}
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
