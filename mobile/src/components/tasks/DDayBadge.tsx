import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { calculateDDay, getDDayUrgency } from '@shared/category-calculator'
import { colors } from '../../theme/colors'
import { toneColors } from '../../theme/tones'

type Props = {
  scheduledDate: number
}

export function DDayBadge({ scheduledDate }: Props) {
  const label = calculateDDay(scheduledDate)
  const urgency = getDDayUrgency(scheduledDate)

  const badgeBg =
    urgency === 'overdue' ? colors.error : urgency === 'today' ? colors.warning : toneColors.timed.dot

  const textColor = urgency === 'today' ? colors.bg : colors.bg

  return (
    <View style={[styles.badge, { backgroundColor: badgeBg }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
})
