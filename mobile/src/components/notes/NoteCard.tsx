import React from 'react'
import { View, Text, Pressable, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native'
import type { Note } from '@shared/types'
import { DeleteCheckbox } from '../tasks/DeleteCheckbox'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = {
  note: Note
  isExpanded: boolean
  isArmedForDelete: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDeletePress: () => void
  fontSize: number
}

const PREVIEW_LENGTH = 100

export function NoteCard({
  note,
  isExpanded,
  isArmedForDelete,
  onToggleExpand,
  onEdit,
  onDeletePress,
  fontSize,
}: Props) {
  const preview =
    note.content.length > PREVIEW_LENGTH ? note.content.slice(0, PREVIEW_LENGTH) + '...' : note.content

  const formattedDate = new Date(note.updatedAt).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  })

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    onToggleExpand()
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <DeleteCheckbox isArmed={isArmedForDelete} onPress={onDeletePress} />
        <Pressable onPress={handleToggle} style={styles.titleArea}>
          <Text style={[styles.title, { fontSize }]} numberOfLines={isExpanded ? undefined : 1}>
            {note.title}
          </Text>
          <Text style={styles.date}>{formattedDate}</Text>
        </Pressable>
        <TouchableOpacity onPress={onEdit} style={styles.editBtn} hitSlop={8}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>
      <Pressable onPress={handleToggle}>
        <Text style={[styles.content, { fontSize: fontSize - 2 }]} numberOfLines={isExpanded ? undefined : 2}>
          {isExpanded ? note.content : preview}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
    color: colors.textBright,
  },
  date: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
  },
  editBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  content: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
})
