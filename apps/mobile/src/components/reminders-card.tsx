import AsyncStorage from '@react-native-async-storage/async-storage'
import { Bell, X } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { AppState, Linking, Text, View } from 'react-native'
import { getPermission, requestPermission, type PermissionState } from '@/lib/notifications'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

const DISMISS_KEY = 'hisab.remindersCard.dismissed'

/**
 * Asks for notification permission at a moment that makes sense (not on first launch). A quiet one-line
 * prompt below the day's entries — it should never push what's due off the screen.
 */
export function RemindersCard() {
  const { colors } = useTheme()
  const [state, setState] = useState<PermissionState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(DISMISS_KEY).then((v) => v && setDismissed(true))
  }, [])

  useEffect(() => {
    const check = () => void getPermission().then(setState).catch(() => setState(null))
    check()
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => sub.remove()
  }, [])

  if (dismissed || state === null || state === 'granted') return null
  const enable = async () => {
    if (state === 'denied') await Linking.openSettings()
    else setState(await requestPermission())
  }
  return (
    <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 6, paddingVertical: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
        <Bell size={16} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Turn on reminders</Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 1 }}>
          Due dates and money owed
        </Text>
      </View>
      <Press
        accessibilityRole="button"
        accessibilityLabel={state === 'denied' ? 'Open notification settings' : 'Turn on reminders'}
        haptic="selection"
        feedback="scale"
        onPress={() => void enable()}
        hitSlop={6}
        style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand }}
      >
        <Text style={{ color: colors.brandFg, fontSize: 13, fontWeight: '600' }}>Turn on</Text>
      </Press>
      <Press
        accessibilityRole="button"
        accessibilityLabel="Not now"
        hitSlop={4}
        onPress={() => {
          setDismissed(true)
          void AsyncStorage.setItem(DISMISS_KEY, '1')
        }}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={16} color={colors.textFaint} />
      </Press>
    </View>
  )
}
