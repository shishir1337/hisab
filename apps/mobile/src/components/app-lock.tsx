import * as LocalAuthentication from 'expo-local-authentication'
import { Fingerprint, Lock } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { usePrefs } from '@/lib/prefs'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { ToastBlockContext, useToast } from '@/lib/undo'
import { BrandMark } from './brand'
import { Button } from './button'

const RELOCK_AFTER_MS = 60_000

/**
 * Optional biometric lock (spec §8): on launch, and when the app returns after more than a minute in the
 * background. Falls back to the device PIN/pattern when no biometrics are enrolled.
 *
 * The lock is an opaque overlay: the app underneath stays mounted, so a half-filled form or a screen opened
 * from a notification is still there after unlocking. It is a per-phone setting, and it switches itself off
 * if the phone no longer has any screen lock — it must never lock someone out of their own data.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const { prefs, ready, update } = usePrefs()
  const enabled = prefs.appLock
  const { colors } = useTheme()
  const toast = useToast()
  // Until prefs load we don't know whether to lock: cover the app rather than flash balances.
  const [locked, setLocked] = useState(true)
  const [covered, setCovered] = useState(false)
  const [failed, setFailed] = useState(false)
  const backgroundedAt = useRef<number | null>(null)
  const inFlight = useRef(false)
  const decided = useRef(false)

  const unlock = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setFailed(false)
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync()
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        update({ appLock: false })
        setLocked(false)
        toast({ message: 'App lock is off — this phone has no screen lock.' })
        return
      }
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Hisab', disableDeviceFallback: false })
      if (r.success) setLocked(false)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
    }
  }, [update, toast])

  // Decide once, at launch. Turning the lock on later (Settings already verified the user) doesn't lock.
  useEffect(() => {
    if (!ready || decided.current) return
    decided.current = true
    if (!enabled) setLocked(false)
    else void unlock()
  }, [ready, enabled, unlock])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (!enabled) return setCovered(false)
      if (s !== 'active') {
        // Hide balances from the app switcher as soon as we leave the foreground.
        setCovered(true)
        if (s === 'background' && backgroundedAt.current === null) backgroundedAt.current = Date.now()
        return
      }
      setCovered(false)
      const away = backgroundedAt.current
      backgroundedAt.current = null
      if (away !== null && Date.now() - away > RELOCK_AFTER_MS) {
        setLocked(true)
        void unlock()
      }
    })
    return () => sub.remove()
  }, [enabled, unlock])

  const showLock = !ready || (enabled && locked)
  return (
    // Toasts render inside children: while the lock (or the app-switcher cover) is up they stay hidden.
    <ToastBlockContext value={showLock || (enabled && covered)}>
      <View style={{ flex: 1 }}>
        {children}
        {(showLock || (enabled && covered)) && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 1000, elevation: 1000 }]}>
            {showLock && ready && <LockContent failed={failed} onUnlock={() => void unlock()} />}
            {/* While covered for the app switcher (or before prefs load) show just the mark — never balances. */}
            {!(showLock && ready) && <BrandMark size={48} />}
          </View>
        )}
      </View>
    </ToastBlockContext>
  )
}

/** The lock screen itself; exported so it can be checked visually without locking the app. */
export function LockContent({ failed, onUnlock }: { failed: boolean; onUnlock: () => void }) {
  const { colors } = useTheme()
  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand }}>
        <Lock size={26} color={colors.brandFg} />
      </View>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 20 }}>
        Hisab is locked
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ color: failed ? colors.danger : colors.textMuted, fontSize: 14.5, lineHeight: 21, marginTop: 6, textAlign: 'center' }}>
        {failed ? 'Couldn’t verify it’s you. Try again.' : 'Use your fingerprint, face or device PIN.'}
      </Text>
      <View style={{ marginTop: 28, alignSelf: 'stretch' }}>
        <Button onPress={onUnlock} icon={<Fingerprint size={18} color={colors.brandFg} />}>
          Unlock
        </Button>
      </View>
      {failed && (
        <View style={{ marginTop: 6, alignSelf: 'stretch' }}>
          {/* Signing out keeps this phone's data for when you sign back in. */}
          <Button variant="ghost" onPress={() => void supabase.auth.signOut({ scope: 'local' })}>
            Sign out instead
          </Button>
        </View>
      )}
    </View>
  )
}
