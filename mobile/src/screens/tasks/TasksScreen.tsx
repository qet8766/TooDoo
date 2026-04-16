import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'
import { useTaskStore } from '../../stores/taskStore'

export function TasksScreen() {
  const tasks = useTaskStore((s) => s.tasks)
  const activeCount = tasks.filter((t) => !t.deletedAt).length

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Tasks</Text>
      <Text style={styles.count}>{activeCount} active tasks</Text>
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
