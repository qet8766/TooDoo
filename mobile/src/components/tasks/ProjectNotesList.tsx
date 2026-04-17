import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import type { ProjectNote } from '@shared/types'
import { ProjectNoteRow } from './ProjectNoteRow'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = {
  notes: ProjectNote[]
  taskId: string
  armedForDelete: Set<string>
  onDeletePress: (noteId: string) => void
  onUpdate: (noteId: string, content: string) => void
  onAdd: (taskId: string, content: string) => void
  fontSize: number
}

export function ProjectNotesList({
  notes,
  taskId,
  armedForDelete,
  onDeletePress,
  onUpdate,
  onAdd,
  fontSize,
}: Props) {
  const [isAdding, setIsAdding] = useState(false)
  const [newContent, setNewContent] = useState('')

  const activeNotes = notes.filter((n) => !n.deletedAt)

  const handleAdd = () => {
    const trimmed = newContent.trim()
    if (trimmed) {
      onAdd(taskId, trimmed)
      setNewContent('')
      setIsAdding(false)
    }
  }

  return (
    <View style={styles.container}>
      {activeNotes.map((note) => (
        <ProjectNoteRow
          key={note.id}
          note={note}
          isArmedForDelete={armedForDelete.has(note.id)}
          onDeletePress={() => onDeletePress(note.id)}
          onUpdate={(content) => onUpdate(note.id, content)}
          fontSize={fontSize}
        />
      ))}
      {isAdding ? (
        <View style={styles.addForm}>
          <TextInput
            style={[styles.addInput, { fontSize: fontSize - 2 }]}
            value={newContent}
            onChangeText={setNewContent}
            placeholder="Write a note..."
            placeholderTextColor={colors.textDim}
            multiline
            autoFocus
          />
          <View style={styles.addActions}>
            <TouchableOpacity onPress={handleAdd} style={styles.addBtn}>
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setIsAdding(false)
                setNewContent('')
              }}
              style={styles.addBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setIsAdding(true)} style={styles.addNoteBtn}>
          <Text style={styles.addNoteBtnText}>+ Add note</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  addForm: {
    paddingLeft: spacing.sm,
    paddingTop: spacing.xs,
  },
  addInput: {
    color: colors.text,
    backgroundColor: colors.bgInput,
    borderRadius: 6,
    padding: spacing.sm,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  addActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  addBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  cancelBtnText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  addNoteBtn: {
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addNoteBtnText: {
    fontSize: 12,
    color: colors.textDim,
  },
})
