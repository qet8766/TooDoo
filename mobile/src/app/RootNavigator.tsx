import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import type { TaskCategory } from '@shared/types'
import { useAuthStore } from '../stores/authStore'
import { SignInScreen } from '../screens/auth/SignInScreen'
import { QuickAddScreen } from '../screens/tasks/QuickAddScreen'
import { MainTabs } from './MainTabs'

export type RootStackParamList = {
  SignIn: undefined
  Main: undefined
  QuickAdd: { category?: TaskCategory }
}

const Stack = createStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const isSignedIn = useAuthStore((s) => s.isSignedIn)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return null

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isSignedIn ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="QuickAdd"
            component={QuickAddScreen}
            options={{
              presentation: 'transparentModal',
              cardStyleInterpolator: ({ current }) => ({
                cardStyle: { opacity: current.progress },
              }),
            }}
          />
        </>
      ) : (
        <Stack.Screen name="SignIn" component={SignInScreen} />
      )}
    </Stack.Navigator>
  )
}
