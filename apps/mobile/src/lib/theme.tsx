import AsyncStorage from '@react-native-async-storage/async-storage'
import { cssVariables, tokens, type ThemeColors, type ThemeName } from '@hisab/tokens'
import * as SystemUI from 'expo-system-ui'
import { vars, useColorScheme as useNativeWindScheme } from 'nativewind'
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme, View } from 'react-native'

export type ThemePreference = 'system' | 'light' | 'dark'

interface ThemeState {
  preference: ThemePreference
  scheme: ThemeName
  colors: ThemeColors
  setPreference: (p: ThemePreference) => void
}

const STORAGE_KEY = 'hisab.theme'
const themeVars = { light: vars(cssVariables('light')), dark: vars(cssVariables('dark')) }

const ThemeContext = createContext<ThemeState>({
  preference: 'system',
  scheme: 'light',
  colors: tokens.color.light,
  setPreference: () => {},
})
export const useTheme = () => use(ThemeContext)

/** Resolves system/light/dark, exposes token colors, and scopes CSS variables for NativeWind classes. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const nativewind = useNativeWindScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v)
    })
  }, [])

  const scheme: ThemeName = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference

  // NativeWind's setColorScheme('dark') also overrides RN's Appearance, so `useColorScheme()` would keep
  // reporting dark after switching back to System. Handing it 'system' releases the override.
  useEffect(() => {
    nativewind.setColorScheme(preference === 'system' ? 'system' : scheme)
  }, [preference, scheme, nativewind])

  // The native root view shows through during transitions and keyboard resizes: keep it the page colour,
  // so dark mode never flashes the light background set in app.json.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(tokens.color[scheme].page).catch(() => {})
  }, [scheme])

  const value = useMemo<ThemeState>(
    () => ({
      preference,
      scheme,
      colors: tokens.color[scheme],
      setPreference: (p) => {
        setPreferenceState(p)
        void AsyncStorage.setItem(STORAGE_KEY, p)
      },
    }),
    [preference, scheme],
  )

  return (
    <ThemeContext value={value}>
      <View style={[{ flex: 1, backgroundColor: tokens.color[scheme].page }, themeVars[scheme]]}>{children}</View>
    </ThemeContext>
  )
}
