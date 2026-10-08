import { authFormReducer, initialAuthForm, OTP_LENGTH } from '@hisab/core'
import * as Linking from 'expo-linking'
import { ArrowLeft, Mail } from 'lucide-react-native'
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, type EntryAnimationsValues, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { BrandLockup } from '@/components/brand'
import { Button } from '@/components/button'
import { OtpInput } from '@/components/otp-input'
import { Press } from '@/components/press'
import { SignInHero } from '@/components/sign-in-hero'
import { useFirstRun } from '@/lib/first-run'
import { googleSignInAvailable, signInWithGoogle } from '@/lib/google-auth'
import { duration, easing, haptic, useMotion } from '@/lib/motion'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'

/** Supabase's hosted default allows one code email per address per 60 s. */
const RESEND_SECONDS = 60

/**
 * Dev only: addresses on the reserved `.test` TLD skip the network, so the code step (digit boxes, wrong-code
 * shake, resend timer) can be exercised without sending real email. Any code is "wrong".
 */
const isDevFake = (email: string) => __DEV__ && email.endsWith('@example.test')

/** Each step's content slides up into place; the previous one fades. */
const stepIn = (_v: EntryAnimationsValues) => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 14 }] },
    animations: {
      opacity: withTiming(1, { duration: duration.base, easing: easing.out }),
      transform: [{ translateY: withTiming(0, { duration: duration.slow, easing: easing.out }) }],
    },
  }
}

export default function SignInScreen() {
  const [state, dispatch] = useReducer(authFormReducer, initialAuthForm)
  const [cooldown, setCooldown] = useState(0)
  const [emailFocused, setEmailFocused] = useState(false)
  const { colors } = useTheme()
  const { reduced } = useMotion()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const codeRef = useRef<TextInput>(null)
  const [google, setGoogle] = useState<'idle' | 'busy'>('idle')
  const [googleError, setGoogleError] = useState<string | null>(null)
  const showGoogle = googleSignInAvailable()
  // Choose a method first (Google or email); without Google, go straight to the email field.
  const [method, setMethod] = useState<'choose' | 'email'>(showGoogle ? 'choose' : 'email')
  const [shakeKey, setShakeKey] = useState(0)
  const { resetWelcome } = useFirstRun()

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
      if (isDevFake(state.email)) {
        const t = setTimeout(() => {
          dispatch({ type: 'sent' })
          setCooldown(RESEND_SECONDS)
        }, 400)
        return () => clearTimeout(t)
      }
      supabase.auth.signInWithOtp({ email: state.email, options: { shouldCreateUser: true, emailRedirectTo: Linking.createURL('auth-callback') } }).then(({ error }) => {
        if (error) dispatch({ type: 'sendFailed', error: friendlyError(error.message) })
        else {
          dispatch({ type: 'sent' })
          setCooldown(RESEND_SECONDS)
        }
      })
    }
    if (state.status === 'verifying') {
      if (isDevFake(state.email)) {
        const t = setTimeout(() => dispatch({ type: 'verifyFailed', error: friendlyError('Token has expired or is invalid') }), 500)
        return () => clearTimeout(t)
      }
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

  // A rejected code (verifying → idle with an error) shakes the boxes, with a warning haptic.
  const prevStatus = useRef(state.status)
  useEffect(() => {
    if (prevStatus.current === 'verifying' && state.status === 'idle' && state.error) setShakeKey((k) => k + 1)
    prevStatus.current = state.status
  }, [state.status, state.error])

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

  const choosing = state.step === 'email' && method === 'choose'
  const stepKey = state.step === 'code' ? 'code' : method
  const layout = reduced ? undefined : LinearTransition.duration(duration.slow).easing(easing.out)

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}
      >
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center' }}>
          <Press
            accessibilityRole="header"
            accessibilityLabel="Hisab"
            feedback="none"
            focusable={false}
            // Dev only: long-press the logo to see the walkthrough and long intro again on next launch.
            onLongPress={__DEV__ ? () => (haptic.medium(), resetWelcome()) : undefined}
          >
            <BrandLockup size={28} />
          </Press>
        </View>

        {choosing && (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.slow)} exiting={reduced ? undefined : FadeOut.duration(duration.fast)} style={{ flex: 1, justifyContent: 'center', minHeight: 300 }}>
            <SignInHero width={width - 48} />
          </Animated.View>
        )}

        <Animated.View layout={layout} style={{ flex: choosing ? 0 : 1, justifyContent: choosing ? 'flex-end' : 'flex-start', paddingTop: choosing ? 8 : 28 }}>
          <Animated.View key={stepKey} entering={reduced ? FadeIn.duration(duration.fast) : stepIn}>
            {state.step === 'code' ? (
              <CodeStep
                email={state.email}
                code={state.code}
                error={state.error}
                status={state.status}
                cooldown={cooldown}
                shakeKey={shakeKey}
                codeRef={codeRef}
                onCode={(code) => dispatch({ type: 'setCode', code })}
                onVerify={() => dispatch({ type: 'submitCode' })}
                onResend={() => dispatch({ type: 'resend' })}
                onBack={() => dispatch({ type: 'back' })}
              />
            ) : method === 'choose' ? (
              <>
                <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.9, lineHeight: 35 }}>
                  Know where your{'\n'}money goes
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15.5, marginTop: 8, lineHeight: 22 }}>Spending, bills and money you lend, in one calm place.</Text>
                <View style={{ marginTop: 26, gap: 10 }}>
                  <BigButton
                    primary
                    busy={google === 'busy'}
                    icon={<GoogleMark />}
                    label="Continue with Google"
                    onPress={() => void continueWithGoogle()}
                  />
                  {googleError ? <ErrorText message={googleError} /> : null}
                  <BigButton icon={<Mail size={19} color={colors.text} strokeWidth={1.9} />} label="Continue with email" onPress={() => setMethod('email')} />
                </View>
              </>
            ) : (
              <>
                {showGoogle && <BackLink label="Other ways to sign in" onPress={() => setMethod('choose')} />}
                <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.7 }}>
                  {showGoogle ? 'What’s your email?' : 'Sign in to Hisab'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6, lineHeight: 21 }}>
                  We’ll email you a 6-digit code. No password. New here? The same step creates your account.
                </Text>
                <View
                  style={{
                    marginTop: 24,
                    height: 56,
                    borderRadius: 16,
                    borderWidth: emailFocused ? 1.5 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingLeft: 16,
                    backgroundColor: colors.surface,
                    borderColor: state.error ? colors.danger : emailFocused ? colors.text : colors.border,
                  }}
                >
                  <Mail size={18} color={emailFocused ? colors.text : colors.textFaint} strokeWidth={1.9} />
                  <TextInput
                    accessibilityLabel="Email"
                    autoFocus
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
                    style={{ flex: 1, height: '100%', paddingHorizontal: 12, color: colors.text, fontSize: 16 }}
                  />
                </View>
                <ErrorText message={state.error} />
                <Button onPress={() => dispatch({ type: 'submitEmail' })} loading={state.status === 'sending'}>
                  Send code
                </Button>
              </>
            )}
          </Animated.View>
        </Animated.View>

        <Text style={{ color: colors.textFaint, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 22 }}>
          By continuing you agree to the <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Terms</Text> and{' '}
          <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Privacy Policy</Text>.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function CodeStep({
  email,
  code,
  error,
  status,
  cooldown,
  shakeKey,
  codeRef,
  onCode,
  onVerify,
  onResend,
  onBack,
}: {
  email: string
  code: string
  error: string | null
  status: 'idle' | 'sending' | 'verifying'
  cooldown: number
  shakeKey: number
  codeRef: React.RefObject<TextInput | null>
  onCode: (c: string) => void
  onVerify: () => void
  onResend: () => void
  onBack: () => void
}) {
  const { colors } = useTheme()
  const mm = Math.floor(cooldown / 60)
  const ss = String(cooldown % 60).padStart(2, '0')
  return (
    <>
      <BackLink label="Use a different email" onPress={onBack} />
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.7 }}>
        Check your email
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6, lineHeight: 21 }}>
        Enter the code we sent to <Text style={{ color: colors.text, fontWeight: '600' }}>{email}</Text>, or open the link in that email on this phone.
      </Text>
      <View style={{ marginTop: 24 }}>
        <OtpInput value={code} length={OTP_LENGTH} onChange={onCode} editable={status === 'idle'} invalid={Boolean(error)} shakeKey={shakeKey} inputRef={codeRef} />
      </View>
      <ErrorText message={error} />
      <Button onPress={onVerify} loading={status === 'verifying'}>
        Verify
      </Button>
      <View style={{ marginTop: 10, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
        {cooldown > 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>
            Didn’t get it? Resend in {mm}:{ss}
          </Text>
        ) : (
          <Animated.View entering={FadeInDown.duration(duration.base)}>
            <Press accessibilityRole="button" onPress={onResend} disabled={status !== 'idle'} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>{status === 'sending' ? 'Sending…' : 'Resend code'}</Text>
            </Press>
          </Animated.View>
        )}
      </View>
    </>
  )
}

function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      style={{ marginLeft: -2, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}
    >
      <ArrowLeft size={17} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{label}</Text>
    </Press>
  )
}

/** Tall method button: ink primary (Google) or paper secondary (email). */
function BigButton({ label, icon, onPress, primary, busy }: { label: string; icon: ReactNode; onPress: () => void; primary?: boolean; busy?: boolean }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      haptic="selection"
      feedback="scale"
      onPress={onPress}
      style={{
        height: 58,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: primary ? colors.brand : colors.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: busy ? 0.7 : 1,
      }}
    >
      {primary ? (
        // Google's mark sits on a white disc, per its branding guidance for dark buttons.
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      ) : (
        icon
      )}
      <Text style={{ color: primary ? colors.brandFg : colors.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.1 }}>{busy ? 'Opening Google…' : label}</Text>
    </Press>
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
