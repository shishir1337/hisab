import { Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'

/** Initials on a soft circle with a hairline, so it reads on the page as well as inside cards. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const { colors } = useTheme()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: colors.text, fontSize: size * 0.36, fontWeight: '600', letterSpacing: 0.2 }}>{initials || '?'}</Text>
    </View>
  )
}
