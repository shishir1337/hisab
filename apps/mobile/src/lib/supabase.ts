import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'
import { createChunkedStorage } from './chunked-storage'
import { storageKeyFor } from './stored-session'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

/** Session tokens live in the Android Keystore via expo-secure-store (spec §8). */
export const sessionStorage = createChunkedStorage({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
})

export const SESSION_STORAGE_KEY = storageKeyFor(SUPABASE_URL)

export const supabase = createClient(SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : sessionStorage,
    storageKey: SESSION_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}
