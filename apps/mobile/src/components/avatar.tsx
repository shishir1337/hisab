import { Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'

/** Initials on a soft circle. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const { colors } = useTheme()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontSize: size * 0.38, fontWeight: '700' }}>{initials || '?'}</Text>
    </View>
  )
}
