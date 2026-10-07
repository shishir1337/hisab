import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Device-local preferences. Reminders depend on the phone, and app lock must be per phone: a lock turned
 * on elsewhere could otherwise lock you out of a phone that has no screen lock.
 */
export interface Prefs {
  nudgeEnabled: boolean
  nudgeTime: string
  reminderIntervalDays: number
  appLock: boolean
}

const DEFAULTS: Prefs = { nudgeEnabled: true, nudgeTime: '21:00', reminderIntervalDays: 3, appLock: false }
const KEY = 'hisab.prefs'

const PrefsContext = createContext<{ prefs: Prefs; ready: boolean; update: (p: Partial<Prefs>) => void }>({
  prefs: DEFAULTS,
  ready: false,
  update: () => {},
})
export const usePrefs = () => use(PrefsContext)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) }))
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  const update = useCallback((p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p }
      void AsyncStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const value = useMemo(() => ({ prefs, ready, update }), [prefs, ready, update])
  return <PrefsContext value={value}>{children}</PrefsContext>
}
