import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'
import { useNoteStore } from '../../stores/noteStore'

export function NotesScreen() {
  const notes = useNoteStore((s) => s.notes)
  const activeCount = notes.filter((n) => !n.deletedAt).length

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Notetank</Text>
      <Text style={styles.count}>{activeCount} notes</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  text: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textBright,
    marginBottom: 8,
  },
  count: {
    fontSize: 14,
    color: colors.textMuted,
  },
})
