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
import { PrivacyProvider } from '@/lib/privacy'
import { AppLock } from '@/components/app-lock'
import { LaunchIntro, SPLASH_FADE_MS, useAppReleased } from '@/components/launch-intro'
import { FirstRunProvider, useFirstRun } from '@/lib/first-run'
import { showWelcome } from '@/lib/first-run-model'
import { SessionProvider, useSession } from '@/lib/session'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { ToastHost, UndoProvider } from '@/lib/undo'

void SplashScreen.preventAutoHideAsync()
// The launch intro's first frame is identical to the splash, so a short cross-fade is invisible.
SplashScreen.setOptions({ duration: SPLASH_FADE_MS, fade: true })

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SessionProvider>
            <FirstRunProvider>
              <PowerSyncProvider>
                <PrefsProvider>
                  <UndoProvider>
                    <RootStack />
                  </UndoProvider>
                </PrefsProvider>
              </PowerSyncProvider>
              <Intro />
            </FirstRunProvider>
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/** Animated brand intro over everything; it hides the native splash once it's on screen. */
function Intro() {
  const session = useSession()
  const firstRun = useFirstRun()
  return <LaunchIntro ready={session.ready && firstRun.ready} planReady={firstRun.ready} firstLaunch={firstRun.firstLaunch} />
}

function RootStack() {
  const { user, ready: sessionReady } = useSession()
  const firstRun = useFirstRun()
  const { scheme, colors } = useTheme()
  const released = useAppReleased()
  const ready = sessionReady && firstRun.ready && released
  const { welcomeSeen, markWelcomeSeen } = firstRun

  // Anyone who has been signed in on this device is past the walkthrough (also covers existing installs).
  useEffect(() => {
    if (user && !welcomeSeen) markWelcomeSeen()
  }, [user, welcomeSeen, markWelcomeSeen])

  if (!ready) return null
  const stack = (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}>
        <Stack.Protected guard={Boolean(user)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="issues" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
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
        {/* First launch, signed out: the walkthrough comes first; finishing it unguards sign-in's place. */}
        <Stack.Protected guard={showWelcome(Boolean(user), welcomeSeen)}>
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
        </Stack.Protected>
        {/* The email's sign-in link opens here, signed in or not. */}
        <Stack.Screen name="auth-callback" options={{ animation: 'fade' }} />
      </Stack>
    </>
  )
  // The toast host sits after the sheet provider (above sheets) and inside AppLock (under the lock overlay).
  if (!user)
    return (
      <>
        <BottomSheetModalProvider>{stack}</BottomSheetModalProvider>
        <ToastHost />
      </>
    )
  // Sheets portal into BottomSheetModalProvider: keep it inside PrivacyProvider (so sheets see "hide
  // amounts") and inside AppLock (so an open sheet can't show above the lock screen).
  return (
    <PrivacyProvider>
      <AppLock>
        <BottomSheetModalProvider>{stack}</BottomSheetModalProvider>
        <ToastHost />
      </AppLock>
    </PrivacyProvider>
  )
}
