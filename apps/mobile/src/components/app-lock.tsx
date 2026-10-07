import * as LocalAuthentication from 'expo-local-authentication'
import { Lock } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState, Text, View } from 'react-native'
import { useProfile } from '@/lib/profile'
import { useTheme } from '@/lib/theme'
import { Button } from './button'

const RELOCK_AFTER_MS = 60_000

/**
 * Optional biometric lock (spec §8): on launch, and when the app returns after more than a minute in the
 * background. Falls back to the device PIN/pattern when no biometrics are enrolled.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const { appLock, loaded } = useProfile()
  const { colors } = useTheme()
  const [locked, setLocked] = useState(true)
  const [failed, setFailed] = useState(false)
  const backgroundedAt = useRef<number | null>(null)

  const unlock = useCallback(async () => {
    setFailed(false)
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Hisab', disableDeviceFallback: false })
    if (r.success) setLocked(false)
    else setFailed(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (!appLock) return setLocked(false)
    void unlock()
  }, [appLock, loaded, unlock])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (!appLock) return
      if (s === 'background') backgroundedAt.current = Date.now()
      if (s === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) {
        setLocked(true)
        void unlock()
      }
    })
    return () => sub.remove()
  }, [appLock, unlock])

  if (!loaded || !appLock || !locked) return <>{children}</>
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View className="h-14 w-14 items-center justify-center rounded-hero bg-brand">
        <Lock size={24} color={colors.brandFg} />
      </View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 16 }}>Hisab is locked</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4, textAlign: 'center' }}>
        {failed ? 'Couldn’t verify it’s you. Try again.' : 'Use your fingerprint, face or device PIN.'}
      </Text>
      <View className="mt-6 w-full">
        <Button onPress={() => void unlock()}>Unlock</Button>
      </View>
    </View>
  )
}
