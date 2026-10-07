import { Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'

/** The "H" mark: ink tile with a faint top highlight (same as web). */
export function BrandMark({ size = 36 }: { size?: number }) {
  const { colors } = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.31), alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}
    >
      <Text style={{ color: colors.brandFg, fontWeight: '700', fontSize: size * 0.42 }}>H</Text>
    </View>
  )
}
