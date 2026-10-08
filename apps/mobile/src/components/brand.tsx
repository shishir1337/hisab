import { Text, View, type TextStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { BRAND_COLORS, H_PATH, TILE_RADIUS } from '@/lib/brand-geometry'
import { useTheme } from '@/lib/theme'

/**
 * The "H" mark: ink tile with a faint top sheen. Same geometry as the native splash icon
 * (src/lib/brand-geometry.ts), so the launch intro hands off without a jump.
 */
export function BrandMark({ size = 36, scheme: forced }: { size?: number; scheme?: 'light' | 'dark' }) {
  const { scheme: theme } = useTheme()
  const scheme = forced ?? theme
  const c = BRAND_COLORS[scheme]
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="brand-hl" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={scheme === 'light' ? 0.07 : 0} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} rx={TILE_RADIUS} fill={c.tile} />
        <Rect x={0} y={0} width={100} height={100} rx={TILE_RADIUS} fill="url(#brand-hl)" />
        <Path d={H_PATH} fill={c.glyph} />
      </Svg>
    </View>
  )
}

/** "Hisab" set beside the mark. `size` is the mark size; the word scales with it. */
export function Wordmark({ size = 36, color, style }: { size?: number; color?: string; style?: TextStyle }) {
  const { colors } = useTheme()
  return (
    <Text style={[{ color: color ?? colors.text, fontWeight: '700', fontSize: size * 0.56, letterSpacing: -size * 0.022, includeFontPadding: false }, style]}>
      Hisab
    </Text>
  )
}

/** Mark + word, the standard lock-up. */
export function BrandLockup({ size = 32 }: { size?: number }) {
  return (
    <View accessible accessibilityLabel="Hisab" style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }}>
      <BrandMark size={size} />
      <Wordmark size={size} />
    </View>
  )
}
