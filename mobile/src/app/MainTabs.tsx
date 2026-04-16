import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { colors } from '../theme/colors'
import { TasksScreen } from '../screens/tasks/TasksScreen'
import { NotesScreen } from '../screens/notes/NotesScreen'

export type MainTabParamList = {
  Tasks: undefined
  Notes: undefined
}

const Tab = createBottomTabNavigator<MainTabParamList>()

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.bgSecondary, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ title: 'TooDoo' }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesScreen}
        options={{ title: 'Notetank' }}
      />
    </Tab.Navigator>
  )
}
