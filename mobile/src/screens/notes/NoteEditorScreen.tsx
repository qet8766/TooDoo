import React, { useMemo, useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { NotesStackParamList } from '../../app/NotesStack'
import { useNoteStore } from '../../stores/noteStore'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = StackScreenProps<NotesStackParamList, 'NoteEditor'>

export function NoteEditorScreen({ route, navigation }: Props) {
  const noteId = route.params?.noteId
  const isEditing = !!noteId

  // Read the existing note once on mount (stable because noteId doesn't change for this screen)
  const existingNote = useMemo(
    () => (noteId ? useNoteStore.getState().notes.find((n) => n.id === noteId) : undefined),
    [noteId],
  )

  const [title, setTitle] = useState(existingNote?.title ?? '')
  const [content, setContent] = useState(existingNote?.content ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSave = async () => {
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()
    if (!trimmedTitle || isSubmitting) return
    setIsSubmitting(true)

    if (isEditing && noteId) {
      await useNoteStore.getState().updateNote({
        id: noteId,
        title: trimmedTitle,
        content: trimmedContent,
      })
    } else {
      await useNoteStore.getState().addNote({
        title: trimmedTitle,
        content: trimmedContent,
      })
    }

    navigation.goBack()
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.form}>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Note title"
          placeholderTextColor={colors.textDim}
          autoFocus={!isEditing}
          maxLength={200}
        />
        <TextInput
          style={styles.contentInput}
          value={content}
          onChangeText={setContent}
          placeholder="Write your note..."
          placeholderTextColor={colors.textDim}
          multiline
          textAlignVertical="top"
          maxLength={50000}
        />
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, !title.trim() && styles.saveBtnDisabled]}
          disabled={!title.trim() || isSubmitting}
        >
          <Text style={styles.saveBtnText}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Note'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  form: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleInput: {
    color: colors.textBright,
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  contentInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    lineHeight: 22,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.bg,
  },
})
