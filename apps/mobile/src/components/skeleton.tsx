import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { Text, View, type DimensionValue } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { Divider } from './screen'

/** One sweep across a bone; every bone in a group shares the clock, so the shine moves together. */
const SWEEP_MS = 1400
const BAND = 140

const Clock = createContext<SharedValue<number> | null>(null)

/** Shares one shimmer clock with every Bone inside it (static with reduced motion). */
export function SkeletonGroup({ children }: { children: ReactNode }) {
  const { reduced } = useMotion()
  const t = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    t.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false)
    return () => cancelAnimation(t)
  }, [reduced, t])
  return <Clock value={reduced ? null : t}>{children}</Clock>
}

/** A placeholder block shaped like the content it stands in for. */
export function Bone({ width = '100%', height, radius = 8, style }: { width?: DimensionValue; height: number; radius?: number; style?: object }) {
  const { colors, scheme } = useTheme()
  const t = use(Clock)
  const [w, setW] = useState(0)
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: t ? -BAND + t.value * (w + BAND) : -BAND }] }))
  const shine = '#FFFFFF'
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.surfaceMuted }, style]}
    >
      {t && w > 0 ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, width: BAND }, band]}>
          <Svg width={BAND} height={height}>
            <Defs>
              <LinearGradient id="sh" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={shine} stopOpacity={0} />
                <Stop offset="0.5" stopColor={shine} stopOpacity={scheme === 'dark' ? 0.06 : 0.55} />
                <Stop offset="1" stopColor={shine} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={BAND} height={height} fill="url(#sh)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}

/** Rows shaped like TransactionRow (tile, two lines, amount) inside the usual card. */
export function RowsSkeleton({ count = 3 }: { count?: number }) {
  const { colors } = useTheme()
  return (
    <View accessibilityLabel="Loading" style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={52} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 10 }}>
            <Bone width={40} height={40} radius={13} />
            <View style={{ flex: 1, marginLeft: 12, marginRight: 12, gap: 8 }}>
              <Bone width={`${[58, 44, 66, 50][i % 4]}%`} height={12} radius={6} />
              <Bone width={`${[36, 48, 30, 42][i % 4]}%`} height={10} radius={5} />
            </View>
            <Bone width={54} height={12} radius={6} />
          </View>
        </View>
      ))}
    </View>
  )
}

/** Home before the first sync: the hero's shape (same height, so nothing jumps when it arrives). */
export function HeroSkeleton() {
  const { colors } = useTheme()
  return (
    <View>
      <View accessibilityLabel="Loading your balance" style={{ height: 242, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20 }}>
        <Bone width={96} height={12} radius={6} />
        <Bone width={190} height={30} radius={10} style={{ marginTop: 14 }} />
        <Bone height={30} radius={8} style={{ marginTop: 18 }} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Bone width="48%" height={52} radius={14} />
          <Bone width="48%" height={52} radius={14} />
        </View>
      </View>
      <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>Getting your data onto this phone…</Text>
    </View>
  )
}
