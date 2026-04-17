import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { colors } from '../theme/colors'
import { NotesScreen } from '../screens/notes/NotesScreen'
import { NoteEditorScreen } from '../screens/notes/NoteEditorScreen'

export type NotesStackParamList = {
  NotesList: undefined
  NoteEditor: { noteId?: string }
}

const Stack = createStackNavigator<NotesStackParamList>()

export function NotesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="NotesList"
        component={NotesScreen}
        options={{ title: 'Notetank' }}
      />
      <Stack.Screen
        name="NoteEditor"
        component={NoteEditorScreen}
        options={({ route }) => ({
          title: route.params?.noteId ? 'Edit Note' : 'New Note',
        })}
      />
    </Stack.Navigator>
  )
}
