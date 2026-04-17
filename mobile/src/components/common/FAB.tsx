import React from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { colors } from '../../theme/colors'

type Props = {
  onPress: () => void
}

export function FAB({ onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.fab} activeOpacity={0.8}>
      <MaterialCommunityIcons name="plus" size={28} color={colors.bg} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
})
