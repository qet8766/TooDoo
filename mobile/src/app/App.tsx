import React, { useEffect } from 'react'
import { StatusBar } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { useAuthStore } from '../stores/authStore'
import { useTaskStore } from '../stores/taskStore'
import { useNoteStore } from '../stores/noteStore'
import { useUIStore } from '../stores/uiStore'
import { initSync } from '../data/sync'
import { RootNavigator } from './RootNavigator'

const darkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bgSecondary,
    text: colors.text,
    border: colors.border,
    notification: colors.error,
  },
}

export default function App() {
  const initAuth = useAuthStore((s) => s.init)
  const initTasks = useTaskStore((s) => s.init)
  const initNotes = useNoteStore((s) => s.init)
  const initUI = useUIStore((s) => s.init)

  useEffect(() => {
    const bootstrap = async () => {
      // Initialize stores in parallel
      await Promise.all([initAuth(), initTasks(), initNotes(), initUI()])

      // Wire up sync engine with store callbacks
      const taskStore = useTaskStore.getState()
      const noteStore = useNoteStore.getState()
      initSync({
        getAllTasksRaw: taskStore.getAllTasksRaw,
        replaceTaskCache: taskStore.replaceCache,
        getAllNotesRaw: noteStore.getAllNotesRaw,
        replaceNoteCache: noteStore.replaceCache,
        enqueue: taskStore.getEnqueue(),
      })
    }

    bootstrap()
  }, [initAuth, initTasks, initNotes, initUI])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <NavigationContainer theme={darkTheme}>
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
