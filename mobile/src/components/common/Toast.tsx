import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { useToastStore } from '../../stores/toastStore'
import { colors } from '../../theme/colors'
import { spacing } from '../../theme/spacing'

export function ToastHost() {
  const message = useToastStore((s) => s.message)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start()
  }, [message, opacity])

  if (!message) return null

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 100,
    backgroundColor: colors.bgElevated,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
})
