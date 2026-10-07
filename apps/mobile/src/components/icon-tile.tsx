import { categoryTint, type TintName } from '@hisab/tokens'
import { Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'

/** Emoji on a soft per-category tint square (spec §7.1). */
export function IconTile({ icon, tint, size = 36 }: { icon: string | null; tint: string | null; size?: number }) {
  const { scheme } = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: categoryTint((tint ?? 'slate') as TintName, scheme),
      }}
    >
      <Text style={{ fontSize: size * 0.44 }}>{icon ?? '•'}</Text>
    </View>
  )
}
