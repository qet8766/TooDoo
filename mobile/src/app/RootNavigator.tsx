import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { useAuthStore } from '../stores/authStore'
import { SignInScreen } from '../screens/auth/SignInScreen'
import { MainTabs } from './MainTabs'

export type RootStackParamList = {
  SignIn: undefined
  Main: undefined
}

const Stack = createStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const isSignedIn = useAuthStore((s) => s.isSignedIn)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return null

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isSignedIn ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="SignIn" component={SignInScreen} />
      )}
    </Stack.Navigator>
  )
}
