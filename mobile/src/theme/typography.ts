import { Platform } from 'react-native'

const fontFamily = Platform.select({
  android: 'SpaceGrotesk',
  default: 'Space Grotesk',
})

export const typography = {
  fontFamily,
  sizes: {
    xs: 11,
    sm: 13,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    title: 28,
  },
  weights: {
    regular: '400' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const
