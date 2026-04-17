import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { colors } from '../theme/colors'
import { TasksScreen } from '../screens/tasks/TasksScreen'
import { CalendarStack } from './CalendarStack'
import { NotesStack } from './NotesStack'
import { SyncDot } from '../components/common/SyncDot'
import { FontSizeControls } from '../components/common/FontSizeControls'

export type MainTabParamList = {
  Tasks: undefined
  Calendar: undefined
  NotesTab: undefined
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
        options={{
          title: 'TooDoo',
          headerLeft: () => <SyncDot />,
          headerRight: () => <FontSizeControls />,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="format-list-bulleted" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-month" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="NotesTab"
        component={NotesStack}
        options={{
          title: 'Notetank',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="note-text-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
