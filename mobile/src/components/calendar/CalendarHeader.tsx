import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

type Props = {
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
  canGoPrev: boolean
  canGoNext: boolean
}

export function CalendarHeader({ year, month, onPrev, onNext, canGoPrev, canGoNext }: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onPrev}
        disabled={!canGoPrev}
        style={[styles.navBtn, !canGoPrev && styles.disabled]}
        hitSlop={12}
      >
        <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>
        {year}. {month}
      </Text>
      <TouchableOpacity
        onPress={onNext}
        disabled={!canGoNext}
        style={[styles.navBtn, !canGoNext && styles.disabled]}
        hitSlop={12}
      >
        <MaterialCommunityIcons name="chevron-right" size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  navBtn: {
    padding: spacing.xs,
  },
  disabled: {
    opacity: 0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textBright,
    minWidth: 80,
    textAlign: 'center',
  },
})
