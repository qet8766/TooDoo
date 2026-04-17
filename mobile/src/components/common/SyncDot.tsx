import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSyncStatus, type SyncStatus } from '../../hooks/useSyncStatus'
import { colors } from '../../theme/colors'

const STATUS_COLORS: Record<SyncStatus, string> = {
  synced: colors.success,
  syncing: colors.warning,
  offline: colors.textDim,
  error: colors.error,
  'auth-expired': colors.error,
}

export function SyncDot() {
  const { status, dirtyCount } = useSyncStatus()
  const showBadge = dirtyCount > 0 && status !== 'syncing'

  return (
    <View style={styles.wrap}>
      <View style={[styles.dot, { backgroundColor: STATUS_COLORS[status] }]} />
      {showBadge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{dirtyCount > 9 ? '9+' : dirtyCount}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginLeft: 16,
    position: 'relative',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
})
