import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useFontSize } from '../../hooks/useFontSize'
import { colors } from '../../theme/colors'

export function FontSizeControls() {
  const { handleFontSizeChange } = useFontSize()

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => handleFontSizeChange(-1)} style={styles.button} hitSlop={8}>
        <Text style={styles.label}>A-</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleFontSizeChange(1)} style={styles.button} hitSlop={8}>
        <Text style={styles.label}>A+</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    gap: 12,
  },
  button: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
})
