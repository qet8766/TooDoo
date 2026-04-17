import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { colors } from '../theme/colors'
import { CalendarScreen } from '../screens/calendar/CalendarScreen'
import { CalendarDayScreen } from '../screens/calendar/CalendarDayScreen'

export type CalendarStackParamList = {
  CalendarGrid: undefined
  CalendarDay: { dateMs: number }
}

const Stack = createStackNavigator<CalendarStackParamList>()

export function CalendarStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="CalendarGrid"
        component={CalendarScreen}
        options={{ title: 'Calendar' }}
      />
      <Stack.Screen
        name="CalendarDay"
        component={CalendarDayScreen}
        options={{ title: '' }}
      />
    </Stack.Navigator>
  )
}
