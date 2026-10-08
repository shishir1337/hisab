import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LAUNCHED_KEY, parseFirstRun, WELCOME_KEY } from './first-run-model'

interface FirstRunState {
  /** False until the flags have been read (routing waits for this so the walkthrough never flashes). */
  ready: boolean
  welcomeSeen: boolean
  /** This is the app's first launch on this device (decides the long vs short intro). */
  firstLaunch: boolean
  markWelcomeSeen: () => void
  /** Dev only: forget both flags (walkthrough and long intro come back on the next launch). */
  resetWelcome: () => void
}

const FirstRunContext = createContext<FirstRunState>({
  ready: false,
  welcomeSeen: true,
  firstLaunch: false,
  markWelcomeSeen: () => {},
  resetWelcome: () => {},
})
export const useFirstRun = () => use(FirstRunContext)

/** Device-local first-run flags: the pre-sign-in walkthrough and the long launch intro. */
export function FirstRunProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ ready: false, welcomeSeen: true, firstLaunch: false })

  useEffect(() => {
    AsyncStorage.multiGet([WELCOME_KEY, LAUNCHED_KEY])
      .then((entries) => {
        const flags = parseFirstRun(entries)
        setState({ ready: true, ...flags })
        if (flags.firstLaunch) void AsyncStorage.setItem(LAUNCHED_KEY, '1').catch(() => {})
      })
      // Storage unreadable: don't trap anyone in the walkthrough.
      .catch(() => setState({ ready: true, welcomeSeen: true, firstLaunch: false }))
  }, [])

  const markWelcomeSeen = useCallback(() => {
    setState((s) => (s.welcomeSeen ? s : { ...s, welcomeSeen: true }))
    void AsyncStorage.setItem(WELCOME_KEY, '1').catch(() => {})
  }, [])
  const resetWelcome = useCallback(() => {
    setState((s) => ({ ...s, welcomeSeen: false }))
    void AsyncStorage.multiRemove([WELCOME_KEY, LAUNCHED_KEY]).catch(() => {})
  }, [])

  const value = useMemo(() => ({ ...state, markWelcomeSeen, resetWelcome }), [state, markWelcomeSeen, resetWelcome])
  return <FirstRunContext value={value}>{children}</FirstRunContext>
}
