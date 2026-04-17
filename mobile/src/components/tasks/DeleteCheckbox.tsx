import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { colors } from '../../theme/colors'

type Props = {
  isArmed: boolean
  onPress: () => void
}

export function DeleteCheckbox({ isArmed, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.circle, isArmed && styles.armed]}
    >
      {isArmed && <MaterialCommunityIcons name="close" size={12} color={colors.bg} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  armed: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
})
