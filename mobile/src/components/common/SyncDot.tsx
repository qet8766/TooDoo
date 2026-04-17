import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useSyncStatus, type SyncStatus } from '../../hooks/useSyncStatus'
import { colors } from '../../theme/colors'

const STATUS_COLORS: Record<SyncStatus, string> = {
  synced: colors.success,
  syncing: colors.warning,
  offline: colors.textDim,
  error: colors.error,
}

export function SyncDot() {
  const status = useSyncStatus()

  return <View style={[styles.dot, { backgroundColor: STATUS_COLORS[status] }]} />
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 16,
  },
})
