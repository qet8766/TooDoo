import React from 'react'
import { Modal, Text, Pressable, StyleSheet } from 'react-native'
import type { Task, TaskCategory } from '@shared/types'
import { CategoryPicker } from '../tasks/CategoryPicker'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = {
  visible: boolean
  task: Task | null
  onSelect: (taskId: string, category: TaskCategory) => void
  onClose: () => void
}

export function CategoryMoveSheet({ visible, task, onSelect, onClose }: Props) {
  if (!task) return null

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.title}>Move to...</Text>
          <CategoryPicker
            selected={task.category}
            onSelect={(cat) => {
              if (cat !== task.category) {
                onSelect(task.id, cat)
              }
              onClose()
            }}
            exclude={task.category}
          />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.xxl,
    paddingBottom: spacing.xxxl + spacing.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textBright,
    marginBottom: spacing.lg,
  },
})
