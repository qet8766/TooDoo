import React, { useCallback, useMemo, useState } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, LayoutAnimation } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { Note } from '@shared/types'
import type { NotesStackParamList } from '../../app/NotesStack'
import { useNoteStore } from '../../stores/noteStore'
import { useDeleteArm } from '../../hooks/useDeleteArm'
import { useFontSize } from '../../hooks/useFontSize'
import { NoteCard } from '../../components/notes/NoteCard'
import { FAB } from '../../components/common/FAB'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

export function NotesScreen() {
  const navigation = useNavigation<StackNavigationProp<NotesStackParamList>>()
  const notes = useNoteStore((s) => s.notes)
  const { fontSize } = useFontSize()
  const { armedForDelete, armForDelete, disarmDelete } = useDeleteArm()

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())

  const activeNotes = useMemo(() => {
    const active = notes.filter((n) => !n.deletedAt)
    if (!searchQuery.trim()) return active
    const q = searchQuery.toLowerCase()
    return active.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    )
  }, [notes, searchQuery])

  const handleToggleExpand = useCallback((noteId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }, [])

  const handleDeletePress = useCallback(
    (noteId: string) => {
      if (armedForDelete.has(noteId)) {
        disarmDelete(noteId)
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        useNoteStore.getState().deleteNote(noteId)
      } else {
        armForDelete(noteId)
      }
    },
    [armedForDelete, armForDelete, disarmDelete],
  )

  const renderNote = useCallback(
    ({ item }: { item: Note }) => (
      <NoteCard
        note={item}
        isExpanded={expandedNotes.has(item.id)}
        isArmedForDelete={armedForDelete.has(item.id)}
        onToggleExpand={() => handleToggleExpand(item.id)}
        onEdit={() => navigation.navigate('NoteEditor', { noteId: item.id })}
        onDeletePress={() => handleDeletePress(item.id)}
        fontSize={fontSize}
      />
    ),
    [expandedNotes, armedForDelete, handleToggleExpand, handleDeletePress, navigation, fontSize],
  )

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes..."
          placeholderTextColor={colors.textDim}
        />
      </View>

      <FlatList
        data={activeNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderNote}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching notes' : 'No notes yet'}
            </Text>
            {!searchQuery && <Text style={styles.emptyHint}>Tap + to create your first note</Text>}
          </View>
        }
      />

      <FAB onPress={() => navigation.navigate('NoteEditor', {})} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    color: colors.text,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 80,
    flexGrow: 1,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textDim,
  },
})
