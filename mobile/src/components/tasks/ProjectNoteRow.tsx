import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import type { ProjectNote } from '@shared/types'
import { DeleteCheckbox } from './DeleteCheckbox'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = {
  note: ProjectNote
  isArmedForDelete: boolean
  onDeletePress: () => void
  onUpdate: (content: string) => void
  fontSize: number
}

export function ProjectNoteRow({ note, isArmedForDelete, onDeletePress, onUpdate, fontSize }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)

  const handleSave = () => {
    const trimmed = editContent.trim()
    if (trimmed && trimmed !== note.content) {
      onUpdate(trimmed)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditContent(note.content)
    setIsEditing(false)
  }

  return (
    <View style={styles.container}>
      <DeleteCheckbox isArmed={isArmedForDelete} onPress={onDeletePress} />
      {isEditing ? (
        <View style={styles.editContainer}>
          <TextInput
            style={[styles.editInput, { fontSize: fontSize - 2 }]}
            value={editContent}
            onChangeText={setEditContent}
            multiline
            autoFocus
          />
          <View style={styles.editActions}>
            <TouchableOpacity onPress={handleSave} style={styles.editBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancel} style={styles.editBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.contentArea}>
          <Text style={[styles.content, { fontSize: fontSize - 2 }]} numberOfLines={3}>
            {note.content}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
  },
  contentArea: {
    flex: 1,
  },
  content: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  editContainer: {
    flex: 1,
  },
  editInput: {
    color: colors.text,
    backgroundColor: colors.bgInput,
    borderRadius: 6,
    padding: spacing.sm,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  editBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  cancelBtnText: {
    fontSize: 12,
    color: colors.textMuted,
  },
})
