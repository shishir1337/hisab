import { Bell } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { AppState, Linking, Pressable, Text, View } from 'react-native'
import { getPermission, requestPermission, type PermissionState } from '@/lib/notifications'
import { useTheme } from '@/lib/theme'
import { Button } from './button'

/** Asks for notification permission at a moment that makes sense (not on first launch). */
export function RemindersCard() {
  const { colors } = useTheme()
  const [state, setState] = useState<PermissionState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const check = () => void getPermission().then(setState).catch(() => setState(null))
    check()
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => sub.remove()
  }, [])

  if (dismissed || state === null || state === 'granted') return null
  return (
    <View className="mt-4 flex-row items-start gap-3 rounded-card border border-border bg-surface p-4">
      <View className="h-9 w-9 items-center justify-center rounded-tile bg-surface-muted">
        <Bell size={18} color={colors.text} />
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>Turn on reminders</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>
          EMI due dates, money people owe you, and a gentle evening nudge to log your day.
        </Text>
        <View className="mt-3 flex-row items-center gap-3">
          <Button
            variant="secondary"
            onPress={async () => {
              if (state === 'denied') await Linking.openSettings()
              else setState(await requestPermission())
            }}
          >
            {state === 'denied' ? 'Open settings' : 'Turn on'}
          </Button>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setDismissed(true)}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
