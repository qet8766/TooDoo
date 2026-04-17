import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import type { TaskCategory } from '@shared/types'
import { ALL_CATEGORIES, CATEGORIES } from '@shared/categories'
import { toneColors } from '../../theme/tones'
import { colors } from '../../theme/colors'

type Props = {
  selected: TaskCategory
  onSelect: (cat: TaskCategory) => void
  exclude?: TaskCategory
}

export function CategoryPicker({ selected, onSelect, exclude }: Props) {
  const categories = exclude ? ALL_CATEGORIES.filter((c) => c !== exclude) : ALL_CATEGORIES

  return (
    <View style={styles.container}>
      {categories.map((cat) => {
        const config = CATEGORIES[cat]
        const tone = toneColors[cat]
        const isActive = cat === selected

        return (
          <TouchableOpacity
            key={cat}
            onPress={() => onSelect(cat)}
            style={[styles.pill, isActive && { backgroundColor: tone.bg, borderColor: tone.dot }]}
          >
            <View style={[styles.dot, { backgroundColor: tone.dot }]} />
            <Text style={[styles.label, isActive && { color: tone.text }]}>{config.title}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
})
