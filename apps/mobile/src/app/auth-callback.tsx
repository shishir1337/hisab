import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { BrandMark } from '@/components/brand'
import { Button } from '@/components/button'
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
      <BrandMark size={48} />
      {error ? (
        <>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', marginTop: 20 }}>
            Couldn’t sign you in
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14.5, lineHeight: 21, marginTop: 6, textAlign: 'center' }}>{error} Request a new code and try again.</Text>
          <View style={{ marginTop: 24, alignSelf: 'stretch' }}>
            <Button onPress={() => router.replace('/sign-in')}>Back to sign in</Button>
          </View>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: 24 }} />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontSize: 14.5, marginTop: 12 }}>
            Signing you in…
          </Text>
        </>
      )}
    </View>
  )
}
