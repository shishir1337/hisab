import { authFormReducer, initialAuthForm, OTP_LENGTH } from '@hisab/core'
import * as Linking from 'expo-linking'
import { ArrowLeft, Mail } from 'lucide-react-native'
import { useEffect, useReducer, useRef, useState } from 'react'
import Svg, { Path } from 'react-native-svg'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandMark } from '@/components/brand'
import { Button } from '@/components/button'
import { Press } from '@/components/press'
import { googleSignInAvailable, signInWithGoogle } from '@/lib/google-auth'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'

/** Supabase's hosted default allows one code email per address per 60 s. */
const RESEND_SECONDS = 60

export default function SignInScreen() {
  const [state, dispatch] = useReducer(authFormReducer, initialAuthForm)
  const [cooldown, setCooldown] = useState(0)
  const [emailFocused, setEmailFocused] = useState(false)
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const codeRef = useRef<TextInput>(null)
  const [google, setGoogle] = useState<'idle' | 'busy'>('idle')
  const [googleError, setGoogleError] = useState<string | null>(null)
  const showGoogle = googleSignInAvailable()
  const continueWithGoogle = async () => {
    if (google === 'busy') return
    setGoogle('busy')
    setGoogleError(null)
    const r = await signInWithGoogle()
    // On success the session listener swaps the protected stack to the app.
    setGoogle('idle')
    if (!r.ok && !r.cancelled) setGoogleError(r.message ?? 'Couldn’t sign in with Google.')
  }

  useEffect(() => {
    if (state.status === 'sending') {
      supabase.auth.signInWithOtp({ email: state.email, options: { shouldCreateUser: true, emailRedirectTo: Linking.createURL('auth-callback') } }).then(({ error }) => {
        if (error) dispatch({ type: 'sendFailed', error: friendlyError(error.message) })
        else {
          dispatch({ type: 'sent' })
          setCooldown(RESEND_SECONDS)
        }
      })
    }
    if (state.status === 'verifying') {
      supabase.auth.verifyOtp({ email: state.email, token: state.code, type: 'email' }).then(({ error }) => {
        // On success the session listener swaps the protected stack to the tabs.
        if (error) dispatch({ type: 'verifyFailed', error: friendlyError(error.message) })
        else dispatch({ type: 'verified' })
      })
    }
  }, [state.status, state.email, state.code])

  // Inputs are disabled while a request is in flight; give focus back when it finishes.
  useEffect(() => {
    if (state.step === 'code' && state.status === 'idle') codeRef.current?.focus()
  }, [state.step, state.status])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (state.step === 'code' && state.code.length === OTP_LENGTH && state.status === 'idle' && !state.error) {
      dispatch({ type: 'submitCode' })
    }
  }, [state.code, state.step, state.status, state.error])

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <BrandMark size={36} />
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18, letterSpacing: -0.3 }}>Hisab</Text>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 32 }}>
          {state.step === 'email' ? (
            <>
              <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 }}>
                Sign in to Hisab
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6, lineHeight: 21 }}>New here? The same step creates your account.</Text>
              {showGoogle && (
                <>
                  <View style={{ marginTop: 28 }}>
                    <Button variant="secondary" icon={<GoogleMark />} loading={google === 'busy'} onPress={() => void continueWithGoogle()}>
                      Continue with Google
                    </Button>
                  </View>
                  <ErrorText message={googleError} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: googleError ? 0 : 18 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ color: colors.textFaint, fontSize: 12.5 }}>or</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  </View>
                </>
              )}
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600', marginTop: showGoogle ? 18 : 28, marginBottom: 8 }}>Email</Text>
              <TextInput
                accessibilityLabel="Email"
                autoFocus={!showGoogle}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                placeholderTextColor={colors.textFaint}
                value={state.email}
                editable={state.status === 'idle'}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onChangeText={(email) => dispatch({ type: 'setEmail', email })}
                onSubmitEditing={() => dispatch({ type: 'submitEmail' })}
                returnKeyType="go"
                style={{
                  height: 52,
                  borderRadius: 14,
                  borderWidth: 1,
                  paddingHorizontal: 16,
                  backgroundColor: colors.surface,
                  color: colors.text,
                  fontSize: 16,
                  borderColor: state.error ? colors.danger : emailFocused ? colors.textFaint : colors.border,
                }}
              />
              <ErrorText message={state.error} />
              <Button onPress={() => dispatch({ type: 'submitEmail' })} loading={state.status === 'sending'}>
                Continue with email
              </Button>
              <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Mail size={14} color={colors.textFaint} />
                <Text style={{ color: colors.textFaint, fontSize: 13 }}>We’ll email you a 6-digit code. No password.</Text>
              </View>
            </>
          ) : (
            <>
              <Press
                accessibilityRole="button"
                onPress={() => dispatch({ type: 'back' })}
                hitSlop={10}
                style={{ marginLeft: -2, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}
              >
                <ArrowLeft size={17} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>Use a different email</Text>
              </Press>
              <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 }}>
                Check your email
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6, lineHeight: 21 }}>
                Enter the code we sent to <Text style={{ color: colors.text, fontWeight: '600' }}>{state.email}</Text>, or open the link in that email on this phone.
              </Text>

              <Pressable accessibilityElementsHidden onPress={() => codeRef.current?.focus()} style={{ marginTop: 28 }}>
                <TextInput
                  ref={codeRef}
                  accessibilityLabel="6-digit code"
                  autoFocus
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  value={state.code}
                  editable={state.status === 'idle'}
                  onChangeText={(code) => dispatch({ type: 'setCode', code })}
                  style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }} pointerEvents="none">
                  {Array.from({ length: OTP_LENGTH }, (_, i) => {
                    const active = state.status === 'idle' && i === Math.min(state.code.length, OTP_LENGTH - 1)
                    return (
                      <View
                        key={i}
                        style={{
                          height: 58,
                          flex: 1,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 14,
                          borderWidth: active ? 1.5 : 1,
                          backgroundColor: colors.surface,
                          borderColor: state.error ? colors.danger : active ? colors.text : colors.border,
                        }}
                      >
                        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{state.code[i] ?? ''}</Text>
                      </View>
                    )
                  })}
                </View>
              </Pressable>
              <ErrorText message={state.error} />
              <Button onPress={() => dispatch({ type: 'submitCode' })} loading={state.status === 'verifying'}>
                Verify
              </Button>
              <View style={{ marginTop: 16, alignItems: 'center' }}>
                {cooldown > 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13.5, fontVariant: ['tabular-nums'], paddingVertical: 12 }}>Resend code in {cooldown}s</Text>
                ) : (
                  <Press accessibilityRole="button" onPress={() => dispatch({ type: 'resend' })} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
                    <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>Resend code</Text>
                  </Press>
                )}
              </View>
            </>
          )}
        </View>

        <Text style={{ color: colors.textFaint, fontSize: 12.5, textAlign: 'center' }}>Know where your money goes — without the month-end struggle.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function ErrorText({ message }: { message: string | null }) {
  const { colors } = useTheme()
  return (
    <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13, marginTop: 8, marginBottom: 8, minHeight: 18 }}>
      {message ?? ''}
    </Text>
  )
}

function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('expired') || m.includes('invalid')) return 'That code is wrong or has expired. Try again or resend.'
  if (m.includes('rate') || m.includes('security purposes')) return 'Too many attempts. Please wait a minute and try again.'
  if (m.includes('fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection.'
  return message
}

/** Google's "G" mark, as Google's sign-in branding guidelines require on the button. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  )
}
