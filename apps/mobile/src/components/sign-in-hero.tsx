import { tokens } from '@hisab/tokens'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { easeOutCubic } from '@/lib/count-up'
import { spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'

const AnimatedPath = Animated.createAnimatedComponent(Path)

/** A month of balance, gently rising with a salary bump: illustrative only, never real data. */
const SERIES = [31, 30.2, 29.6, 30.4, 29.1, 28.4, 28.9, 27.6, 27.1, 27.8, 26.4, 25.9, 26.6, 25.2, 24.6, 25.4, 37.8, 37.2, 38.1, 36.9, 37.4, 36.1, 36.8, 35.6, 36.4, 35.8, 37.2, 36.6, 38.0, 38.6]
const BALANCE = 48250
const IN = 62000
const OUT = 13750
const COUNT_MS = 1100

const group = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Counts 0 → target once, after `delay` (instant with reduced motion). */
function useIntroCount(target: number, delay: number): number {
  const { reduced } = useMotion()
  const [v, setV] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced) return setV(target)
    let raf = 0
    const start = Date.now() + delay
    const tick = () => {
      const t = Date.now() - start
      if (t >= 0) setV(t >= COUNT_MS ? target : target * easeOutCubic(t / COUNT_MS))
      if (t < COUNT_MS) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, delay, reduced])
  return v
}

/**
 * Sign-in hero: a floating ink card with a live preview of what Hisab shows you — the balance counting up,
 * the month's line drawing itself, money in (green) and out. Purely illustrative.
 */
export function SignInHero({ width }: { width: number }) {
  const { scheme, colors } = useTheme()
  const c = tokens.color[scheme]
  const { reduced } = useMotion()
  const cardW = Math.min(width, 360)
  const sparkW = cardW - 40
  const sparkH = 54

  const { d, len, end } = useMemo(() => {
    const min = Math.min(...SERIES)
    const max = Math.max(...SERIES)
    const pts = SERIES.map((v, i) => [(i / (SERIES.length - 1)) * sparkW, 4 + (1 - (v - min) / (max - min)) * (sparkH - 8)] as const)
    let L = 0
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return { d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''), len: Math.ceil(L), end: pts[pts.length - 1] }
  }, [sparkW])

  const balance = useIntroCount(BALANCE, 250)
  const moneyIn = useIntroCount(IN, 450)
  const moneyOut = useIntroCount(OUT, 550)

  const draw = useSharedValue(reduced ? 1 : 0)
  const dot = useSharedValue(reduced ? 1 : 0)
  const pulse = useSharedValue(0)
  const float = useSharedValue(0)
  const enter = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    enter.value = withSpring(1, spring.gentle)
    draw.value = withDelay(300, withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }))
    dot.value = withDelay(1500, withSpring(1, spring.bouncy))
    pulse.value = withDelay(1700, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false))
    float.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1, false)
    return () => {
      cancelAnimation(pulse)
      cancelAnimation(float)
    }
  }, [reduced, enter, draw, dot, pulse, float])

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }))
  const areaStyle = useAnimatedStyle(() => ({ opacity: draw.value * 0.9 }))
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dot.value }] }))
  const pulseStyle = useAnimatedStyle(() => ({ opacity: (1 - pulse.value) * 0.5 * dot.value, transform: [{ scale: 1 + pulse.value * 2.2 }] }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 24 + float.value * -5 }, { rotate: `${-2 + float.value * 0.6}deg` }, { scale: 0.96 + enter.value * 0.04 }],
  }))
  const backStyle = useAnimatedStyle(() => ({ opacity: enter.value * 0.9, transform: [{ translateY: (1 - enter.value) * 12 + float.value * 3 }, { rotate: '3.5deg' }] }))

  const positive = scheme === 'dark' ? c.positive : '#4ADE80'
  return (
    <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 18 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* A second card peeking out behind gives the stack some depth. */}
      <Animated.View
        style={[
          { position: 'absolute', top: 30, width: cardW - 44, height: 252, borderRadius: tokens.radius.hero, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
          backStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: cardW,
            borderRadius: tokens.radius.hero,
            overflow: 'hidden',
            backgroundColor: c.heroTo,
            borderWidth: 1,
            borderColor: c.heroBorder,
            padding: 20,
            shadowColor: '#000',
            shadowOpacity: scheme === 'dark' ? 0 : 0.18,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 16 },
            elevation: scheme === 'dark' ? 0 : 14,
          },
          cardStyle,
        ]}
      >
        <Svg width={cardW} height={260} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.heroFrom} />
              <Stop offset="1" stopColor={c.heroTo} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={cardW} height={260} fill="url(#hero-bg)" />
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: c.heroText, opacity: 0.6, fontSize: 12.5, fontWeight: '500' }}>Balance · October</Text>
          <View style={{ paddingHorizontal: 8, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' }}>
            <Text style={{ color: c.heroText, opacity: 0.75, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.4 }}>PREVIEW</Text>
          </View>
        </View>
        <Text style={{ color: c.heroText, fontSize: 34, fontWeight: '700', letterSpacing: -1, marginTop: 6, fontVariant: ['tabular-nums'] }}>
          <Text style={{ fontSize: 34 * tokens.font.currencyCode.scale, fontWeight: '500', opacity: tokens.font.currencyCode.opacity + 0.1, letterSpacing: 0.3 }}>BDT </Text>
          {group(balance)}
        </Text>
        <View style={{ height: sparkH, marginTop: 10 }}>
          <Animated.View style={[StyleSheet.absoluteFill, areaStyle]}>
            <Svg width={sparkW} height={sparkH}>
              <Defs>
                <LinearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={`${d}L${sparkW} ${sparkH}L0 ${sparkH}Z`} fill="url(#hero-area)" />
            </Svg>
          </Animated.View>
          <Svg width={sparkW} height={sparkH} style={StyleSheet.absoluteFill}>
            <AnimatedPath d={d} stroke="#FFFFFF" strokeOpacity={0.92} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" strokeDasharray={len} animatedProps={lineProps} />
          </Svg>
          <Animated.View style={[{ position: 'absolute', left: end[0] - 5, top: end[1] - 5, width: 10, height: 10 }, dotStyle]}>
            <Animated.View style={[{ position: 'absolute', inset: 0, borderRadius: 5, backgroundColor: positive }, pulseStyle]} />
            <Svg width={10} height={10}>
              <Circle cx={5} cy={5} r={4.2} fill={positive} stroke={c.heroTo} strokeWidth={1.4} />
            </Svg>
          </Animated.View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Stat label="Money in" value={group(moneyIn)} color={positive} />
          <Stat label="Spent" value={group(moneyOut)} color={c.heroText} />
        </View>
      </Animated.View>
    </View>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.07)' }}>
      <Text style={{ color: '#FFFFFF', opacity: 0.55, fontSize: 11.5 }}>{label}</Text>
      <Text style={{ color, fontSize: 15, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'], letterSpacing: -0.2 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '500', opacity: 0.6 }}>BDT </Text>
        {value}
      </Text>
    </View>
  )
}
