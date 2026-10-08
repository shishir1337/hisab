import { supabase } from './supabase'

/** The Google *web* client id: the id token's audience, which Supabase verifies (see powersync/README §auth). */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''

type Module = typeof import('@react-native-google-signin/google-signin')

/**
 * The native module only exists in builds made after it was added; loading it lazily keeps older dev
 * builds running (the Google button just doesn't show there).
 */
function load(): Module | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin') as Module
    mod.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID })
    return mod
  } catch {
    return null
  }
}

let cached: Module | null | undefined
const google = () => (cached === undefined ? (cached = load()) : cached)

export const googleSignInAvailable = (): boolean => Boolean(WEB_CLIENT_ID) && google() !== null

export type GoogleResult = { ok: true } | { ok: false; cancelled: boolean; message?: string }

/** Native Google account picker → id token → Supabase session (same email = same account). */
export async function signInWithGoogle(): Promise<GoogleResult> {
  const mod = google()
  if (!mod) return { ok: false, cancelled: false, message: 'Google sign-in isn’t available in this build.' }
  const { GoogleSignin, statusCodes } = mod
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const res = await GoogleSignin.signIn()
    if (res.type !== 'success') return { ok: false, cancelled: true }
    const idToken = res.data.idToken
    if (!idToken) return { ok: false, cancelled: false, message: 'Google didn’t return a sign-in token. Please try again.' }
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
    if (error) return { ok: false, cancelled: false, message: 'Couldn’t sign in with Google. Please try again.' }
    return { ok: true }
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) return { ok: false, cancelled: true }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { ok: false, cancelled: false, message: 'Google Play services is needed for Google sign-in.' }
    return { ok: false, cancelled: false, message: 'Couldn’t sign in with Google. Check your connection and try again.' }
  }
}

/** Forget the Google account choice so the picker shows again next time. Never throws. */
export async function signOutOfGoogle(): Promise<void> {
  await google()?.GoogleSignin.signOut().catch(() => null)
}
