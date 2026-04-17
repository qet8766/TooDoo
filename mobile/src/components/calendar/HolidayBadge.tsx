import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { Holiday } from '@shared/holidays'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = {
  holiday: Holiday
}

export function HolidayBadge({ holiday }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.name}>{holiday.name}</Text>
      {holiday.isSubstitute && <Text style={styles.substitute}>(대체공휴일)</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.error,
  },
  substitute: {
    fontSize: 11,
    color: colors.textMuted,
  },
})
