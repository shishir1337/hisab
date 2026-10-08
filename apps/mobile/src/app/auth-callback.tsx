import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { CircleAlert } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { BrandMark } from '@/components/brand'
import { Button } from '@/components/button'
import { duration, easing, useMotion } from '@/lib/motion'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'

/** Reads the session tokens Supabase puts in the link's fragment (or query, depending on the flow). */
function tokensFrom(url: string): { access_token: string; refresh_token: string } | { error: string } | null {
  const i = url.search(/[#?]/)
  if (i < 0) return null
  const params = new URLSearchParams(url.slice(i + 1).replace('#', '&'))
  const error = params.get('error_description') ?? params.get('error')
  if (error) return { error: error.replace(/\+/g, ' ') }
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  return access_token && refresh_token ? { access_token, refresh_token } : null
}

/**
 * `hisab://auth-callback` — where the sign-in email's link lands on the phone (the code in the email is
 * the main way in; this makes the link work too). On success the session listener swaps to the app.
 */
export default function AuthCallback() {
  const url = Linking.useLinkingURL()
  const { colors } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (!url || handled.current) return
    const t = tokensFrom(url)
    handled.current = true
    if (!t) return setError('This sign-in link is incomplete.')
    if ('error' in t) return setError(t.error)
    void supabase.auth.setSession(t).then(({ error: e }) => {
      if (e) setError('This sign-in link has expired or was already used.')
      else router.replace('/')
    })
  }, [url])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.page }}>
      {error ? (
        <Animated.View key="error" entering={FadeInDown.duration(duration.slow).easing(easing.out)} style={{ alignItems: 'center', alignSelf: 'stretch' }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
            <CircleAlert size={26} color={colors.danger} strokeWidth={2} />
          </View>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', marginTop: 20 }}>
            Couldn’t sign you in
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14.5, lineHeight: 21, marginTop: 6, textAlign: 'center' }}>{error} Request a new code and try again.</Text>
          <View style={{ marginTop: 24, alignSelf: 'stretch' }}>
            <Button onPress={() => router.replace('/sign-in')}>Back to sign in</Button>
          </View>
        </Animated.View>
      ) : (
        <Working />
      )}
    </View>
  )
}

/** Brand mark with a soft ripple and an indeterminate ink line: calm "we're on it". */
function Working() {
  const { colors } = useTheme()
  const { reduced } = useMotion()
  const ripple = useSharedValue(0)
  const bar = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    ripple.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false)
    bar.value = withRepeat(withTiming(1, { duration: 1200, easing: easing.inOut }), -1, false)
    return () => {
      cancelAnimation(ripple)
      cancelAnimation(bar)
    }
  }, [reduced, ripple, bar])
  const rippleStyle = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - ripple.value), transform: [{ scale: 1 + ripple.value * 0.9 }] }))
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -48 + bar.value * 168 }] }))
  return (
    <Animated.View entering={FadeIn.duration(duration.base)} style={{ alignItems: 'center' }}>
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
        {!reduced && <Animated.View style={[{ position: 'absolute', width: 56, height: 56, borderRadius: 18, borderWidth: 1.5, borderColor: colors.text }, rippleStyle]} />}
        <BrandMark size={56} />
      </View>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.3, marginTop: 26 }}>
        Signing you in…
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 6 }}>This only takes a moment.</Text>
      <View style={{ width: 120, height: 3, borderRadius: 2, backgroundColor: colors.surfaceMuted, marginTop: 22, overflow: 'hidden' }}>
        <Animated.View style={[{ width: 48, height: 3, borderRadius: 2, backgroundColor: colors.text, opacity: reduced ? 0.5 : 1 }, reduced ? { width: 120 } : barStyle]} />
      </View>
    </Animated.View>
  )
}
