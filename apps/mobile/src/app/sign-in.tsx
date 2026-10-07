import { authFormReducer, initialAuthForm, OTP_LENGTH } from '@hisab/core'
import { ArrowLeft } from 'lucide-react-native'
import { useEffect, useReducer, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '@/components/button'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'

const RESEND_SECONDS = 30

export default function SignInScreen() {
  const [state, dispatch] = useReducer(authFormReducer, initialAuthForm)
  const [cooldown, setCooldown] = useState(0)
  const { colors } = useTheme()
  const codeRef = useRef<TextInput>(null)

  useEffect(() => {
    if (state.status === 'sending') {
      supabase.auth.signInWithOtp({ email: state.email, options: { shouldCreateUser: true } }).then(({ error }) => {
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
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className="flex-1 justify-center px-6">
          <View className="mb-10 flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-tile bg-brand">
              <Text style={{ color: colors.brandFg, fontWeight: '700', fontSize: 15 }}>H</Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 17 }}>Hisab</Text>
          </View>

          {state.step === 'email' ? (
            <>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>Welcome</Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6 }}>
                Sign in or create an account with your email.
              </Text>
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
                onChangeText={(email) => dispatch({ type: 'setEmail', email })}
                onSubmitEditing={() => dispatch({ type: 'submitEmail' })}
                returnKeyType="go"
                className="mt-8 h-[52px] rounded-[14px] border bg-surface px-4"
                style={{ color: colors.text, fontSize: 16, borderColor: state.error ? colors.danger : colors.border }}
              />
              <ErrorText message={state.error} />
              <View className="mt-4">
                <Button onPress={() => dispatch({ type: 'submitEmail' })} loading={state.status === 'sending'}>
                  Continue
                </Button>
              </View>
              <Text style={{ color: colors.textFaint, fontSize: 12.5, textAlign: 'center', marginTop: 20 }}>
                We’ll email you a 6-digit code. No password needed.
              </Text>
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => dispatch({ type: 'back' })}
                className="-ml-1 mb-6 flex-row items-center gap-1.5 self-start py-1"
              >
                <ArrowLeft size={16} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Use a different email</Text>
              </Pressable>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>
                Check your email
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 6 }}>
                Enter the code we sent to <Text style={{ color: colors.text, fontWeight: '600' }}>{state.email}</Text>
              </Text>

              <Pressable onPress={() => codeRef.current?.focus()} className="mt-8">
                <TextInput
                  ref={codeRef}
                  accessibilityLabel="6-digit code"
                  autoFocus
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  value={state.code}
                  onChangeText={(code) => dispatch({ type: 'setCode', code })}
                  style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                />
                <View className="flex-row gap-2" pointerEvents="none">
                  {Array.from({ length: OTP_LENGTH }, (_, i) => {
                    const active = i === Math.min(state.code.length, OTP_LENGTH - 1)
                    return (
                      <View
                        key={i}
                        className="h-14 flex-1 items-center justify-center rounded-[14px] border bg-surface"
                        style={{
                          borderColor: state.error ? colors.danger : active ? colors.textFaint : colors.border,
                        }}
                      >
                        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                          {state.code[i] ?? ''}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </Pressable>
              <ErrorText message={state.error} />
              <View className="mt-4">
                <Button onPress={() => dispatch({ type: 'submitCode' })} loading={state.status === 'verifying'}>
                  Verify
                </Button>
              </View>
              <View className="mt-4 items-center">
                {cooldown > 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                    Resend code in {cooldown}s
                  </Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      dispatch({ type: 'back' })
                      dispatch({ type: 'submitEmail' })
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Resend code</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ErrorText({ message }: { message: string | null }) {
  const { colors } = useTheme()
  return (
    <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13, marginTop: 8, minHeight: 18 }}>
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
