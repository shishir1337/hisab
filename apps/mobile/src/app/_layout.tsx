import 'react-native-get-random-values'
import '@/global.css'

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PowerSyncProvider } from '@/lib/powersync'
import { PrefsProvider } from '@/lib/prefs'
import { SessionProvider, useSession } from '@/lib/session'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { UndoProvider } from '@/lib/undo'

void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SessionProvider>
            <PowerSyncProvider>
              <PrefsProvider>
                <UndoProvider>
                  <BottomSheetModalProvider>
                    <RootStack />
                  </BottomSheetModalProvider>
                </UndoProvider>
              </PrefsProvider>
            </PowerSyncProvider>
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function RootStack() {
  const { user, ready } = useSession()
  const { scheme, colors } = useTheme()

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}>
        <Stack.Protected guard={Boolean(user)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="account" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="recurring" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="loan-form" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="budget" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="due" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="loan" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="person" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="lend" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="repay" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  )
}
