import { categoryTint } from '@hisab/tokens'
import { Bell, Cloud, CloudOff, Delete, RefreshCw, Smartphone, UtensilsCrossed } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Text, View, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { duration, easing, spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'

/**
 * Walkthrough illustrations, hand-built in the ink style: paper cards with hairlines, one ink accent, and
 * green only where money comes in. Each plays a short loop while its page is active and moves in layers
 * as the pager scrolls (`progress`: 0 = centred, ±1 = a full page away).
 */
export interface ArtProps {
  active: boolean
  progress: SharedValue<number>
  width: number
}

export const ART_HEIGHT = 330

const AnimatedPath = Animated.createAnimatedComponent(Path)

function useInk() {
  const { colors, scheme } = useTheme()
  return {
    ...colors,
    scheme,
    halo: scheme === 'dark' ? '#141516' : '#ECECE8',
    haloRing: scheme === 'dark' ? '#1B1C1E' : '#E4E4DF',
    shadow: scheme === 'dark' ? 'transparent' : '#000000',
  }
}

/** Steps through a looping timeline while active (pauses when not; still frame with reduced motion). */
function useLoop(active: boolean, steps: readonly number[], still: number): number {
  const { reduced } = useMotion()
  const [step, setStep] = useState(reduced ? still : 0)
  const at = useRef(0)
  useEffect(() => {
    if (reduced) return setStep(still)
    if (!active) return
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      t = setTimeout(() => {
        at.current = (at.current + 1) % steps.length
        setStep(at.current)
        tick()
      }, steps[at.current])
    }
    tick()
    return () => clearTimeout(t)
  }, [active, reduced, steps, still])
  return step
}

/** A layer that drifts with the pager: factor > 0 lags behind (background), < 0 leads (foreground). */
function Layer({ progress, width, factor, style, children }: { progress: SharedValue<number>; width: number; factor: number; style?: ViewStyle; children: ReactNode }) {
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * width * factor }] }))
  return <Animated.View style={[style, a]}>{children}</Animated.View>
}

/** Soft halo the scene sits on. */
function Halo({ progress, width, size = 260 }: { progress: SharedValue<number>; width: number; size?: number }) {
  const c = useInk()
  // Neighbours' halos fade out so they never bleed in at the screen edge.
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(progress.value), [0, 0.7], [1, 0], 'clamp'),
    transform: [{ translateX: progress.value * width * 0.45 }, { scale: interpolate(Math.abs(progress.value), [0, 1], [1, 0.8]) }],
  }))
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: c.halo, alignSelf: 'center', top: (ART_HEIGHT - size) / 2 }, a]}>
      <View style={{ position: 'absolute', inset: size * 0.14, borderRadius: size, borderWidth: 1, borderColor: c.haloRing }} />
    </Animated.View>
  )
}

function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useInk()
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: c.border,
          padding: 14,
          shadowColor: c.shadow,
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: c.scheme === 'dark' ? 0 : 6,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const popIn = (_v: EntryAnimationsValues) => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }, { translateY: 6 }] },
    animations: {
      opacity: withTiming(1, { duration: duration.fast, easing: easing.out }),
      transform: [{ scale: withSpring(1, spring.bouncy) }, { translateY: withSpring(0, spring.bouncy) }],
    },
  }
}
const digitIn = (_v: EntryAnimationsValues) => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 10 }, { scale: 0.8 }] },
    animations: {
      opacity: withTiming(1, { duration: duration.fast, easing: easing.out }),
      transform: [{ translateY: withSpring(0, spring.snappy) }, { scale: withSpring(1, spring.bouncy) }],
    },
  }
}

/** Animated tick drawn into a circle. */
function Tick({ on, size = 22, ink, paper }: { on: boolean; size?: number; ink: string; paper: string }) {
  const { reduced } = useMotion()
  const p = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    p.value = reduced ? (on ? 1 : 0) : on ? withTiming(1, { duration: 320, easing: easing.out }) : withTiming(0, { duration: duration.fast })
  }, [on, reduced, p])
  const fill = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: interpolate(p.value, [0, 0.6, 1], [0.5, 1.12, 1]) }] }))
  const stroke = useAnimatedProps(() => ({ strokeDashoffset: 15 * (1 - interpolate(p.value, [0.25, 1], [0, 1], 'clamp')) }))
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', inset: 0, borderRadius: size / 2, borderWidth: 1.5, borderColor: ink, opacity: 0.25 }} />
      <Animated.View style={[{ position: 'absolute', inset: 0, borderRadius: size / 2, backgroundColor: ink }, fill]} />
      <Svg width={size} height={size} viewBox="0 0 22 22" style={{ position: 'absolute' }}>
        <AnimatedPath d="M6.5 11.5l3.2 3.2 6-6.4" stroke={paper} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={15} animatedProps={stroke} />
      </Svg>
    </View>
  )
}

/* ───────────────────────── 1 · Log money in 3 seconds ───────────────────────── */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const
const LOG_STEPS = [800, 420, 420, 650, 1500, 500] as const
const LOG_AMOUNT = ['', '2', '25', '250', '250', '']
const LOG_PRESS: Record<number, string> = { 1: '2', 2: '5', 3: '0', 4: 'save' }

function MiniKey({ k, hit }: { k: (typeof KEYS)[number]; hit: number }) {
  const c = useInk()
  const v = useSharedValue(0)
  useEffect(() => {
    if (hit >= 0) v.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 260, easing: easing.out }))
  }, [hit, v])
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 - v.value * 0.08 }] }))
  const shade = useAnimatedStyle(() => ({ opacity: v.value }))
  return (
    <Animated.View style={[{ flex: 1, height: 30, borderRadius: 9, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, a]}>
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: c.border }, shade]} />
      {k === 'back' ? <Delete size={14} color={c.text} strokeWidth={1.8} /> : <Text style={{ color: c.text, fontSize: 14, fontWeight: '500' }}>{k}</Text>}
    </Animated.View>
  )
}

export function QuickLogArt({ active, progress, width }: ArtProps) {
  const c = useInk()
  const step = useLoop(active, LOG_STEPS, 4)
  const amount = LOG_AMOUNT[step] ?? ''
  const pressed = LOG_PRESS[step]
  const save = useSharedValue(0)
  useEffect(() => {
    if (pressed === 'save') save.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 300 }))
  }, [pressed, step, save])
  const saveStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - save.value * 0.05 }], opacity: 1 - save.value * 0.2 }))

  return (
    <View style={{ width, height: ART_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <Halo progress={progress} width={width} />
      <Layer progress={progress} width={width} factor={0.12}>
        <Card style={{ width: 228 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: c.surfaceMuted, justifyContent: 'center' }}>
              <Text style={{ color: c.textMuted, fontSize: 11.5, fontWeight: '600' }}>Expense</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: categoryTint('amber', c.scheme) }}>
              <UtensilsCrossed size={11} color={c.text} strokeWidth={2} />
              <Text style={{ color: c.text, fontSize: 11.5, fontWeight: '600' }}>Food</Text>
            </View>
          </View>
          <View style={{ height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 6 }}>
            <Text style={{ color: c.text, opacity: 0.45, fontSize: 15, fontWeight: '500', marginRight: 6, marginTop: 6 }}>BDT</Text>
            {amount === '' ? (
              <Text style={{ color: c.textFaint, fontSize: 32, fontWeight: '600', letterSpacing: -0.8 }}>0</Text>
            ) : (
              amount.split('').map((d, i) => (
                <Animated.Text key={`${i}-${d}`} entering={digitIn} style={{ color: c.text, fontSize: 32, fontWeight: '600', letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>
                  {d}
                </Animated.Text>
              ))
            )}
          </View>
          <View style={{ gap: 5 }}>
            {[0, 1, 2, 3].map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 5 }}>
                {KEYS.slice(r * 3, r * 3 + 3).map((k) => (
                  <MiniKey key={k} k={k} hit={pressed === k ? step : -1} />
                ))}
              </View>
            ))}
          </View>
          <Animated.View style={[{ marginTop: 8, height: 34, borderRadius: 11, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }, saveStyle]}>
            <Text style={{ color: c.brandFg, fontSize: 13, fontWeight: '600' }}>Save</Text>
          </Animated.View>
        </Card>
      </Layer>
      {/* Foreground: the confirmation lands in front of the card. */}
      <Layer progress={progress} width={width} factor={-0.18} style={{ position: 'absolute', top: 26, right: Math.max(8, width / 2 - 150) }}>
        {step === 4 && (
          <Animated.View entering={popIn} exiting={FadeOut.duration(duration.fast)}>
            <Chip>
              <Tick on size={18} ink={c.text} paper={c.surface} />
              <Text style={{ color: c.text, fontSize: 12.5, fontWeight: '600' }}>Saved · 3 s</Text>
            </Chip>
          </Animated.View>
        )}
      </Layer>
    </View>
  )
}

function Chip({ children }: { children: ReactNode }) {
  const c = useInk()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingLeft: 8,
        paddingRight: 12,
        height: 34,
        borderRadius: 17,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        shadowColor: c.shadow,
        shadowOpacity: 0.1,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: c.scheme === 'dark' ? 0 : 8,
      }}
    >
      {children}
    </View>
  )
}

/* ───────────────────────── 2 · Never miss an EMI or bill ───────────────────────── */

const DUES = [
  { title: 'Bike EMI', due: 'Sun, 12 Oct', amount: '8,500' },
  { title: 'Internet', due: 'Tue, 14 Oct', amount: '1,200' },
  { title: 'Rent', due: 'Thu, 16 Oct', amount: '18,000' },
]
const DUE_STEPS = [1000, 750, 750, 1700] as const
const WEEK = [
  { d: 'S', n: 12 },
  { d: 'M', n: 13 },
  { d: 'T', n: 14 },
  { d: 'W', n: 15 },
  { d: 'T', n: 16 },
  { d: 'F', n: 17 },
  { d: 'S', n: 18 },
]

export function DueArt({ active, progress, width }: ArtProps) {
  const c = useInk()
  const step = useLoop(active, DUE_STEPS, 2)
  const paid = step // 0..3 rows ticked
  const bar = useSharedValue(paid / 3)
  useEffect(() => {
    bar.value = withTiming(paid / 3, { duration: duration.slow, easing: easing.out })
  }, [paid, bar])
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }))
  const ring = useSharedValue(0)
  const { reduced } = useMotion()
  useEffect(() => {
    if (!active || reduced) return
    ring.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false)
    return () => cancelAnimation(ring)
  }, [active, reduced, ring])
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.7 }] }))

  return (
    <View style={{ width, height: ART_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <Halo progress={progress} width={width} />
      <Layer progress={progress} width={width} factor={0.12}>
        <Card style={{ width: 262, paddingHorizontal: 14, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>This week</Text>
            <Text style={{ color: c.textFaint, fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{3 - paid === 0 ? 'All paid' : `${3 - paid} due`}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 }}>
            {WEEK.map((w, i) => {
              const today = i === 0
              const dueIdx = [0, 2, 4].indexOf(i)
              return (
                <View key={i} style={{ alignItems: 'center', width: 28 }}>
                  <Text style={{ color: c.textFaint, fontSize: 10, fontWeight: '600' }}>{w.d}</Text>
                  <View style={{ marginTop: 4, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: today ? c.brand : 'transparent' }}>
                    {today && <Animated.View style={[{ position: 'absolute', inset: 0, borderRadius: 13, borderWidth: 1.5, borderColor: c.text }, ringStyle]} />}
                    <Text style={{ color: today ? c.brandFg : c.text, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{w.n}</Text>
                  </View>
                  <View style={{ marginTop: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: dueIdx >= 0 ? c.text : 'transparent', opacity: dueIdx >= 0 && dueIdx < paid ? 0.2 : 0.8 }} />
                </View>
              )
            })}
          </View>
          <View style={{ height: 1, backgroundColor: c.borderSubtle, marginHorizontal: -14 }} />
          {DUES.map((d, i) => {
            const done = i < paid
            return (
              <View key={d.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46 }}>
                <Tick on={done} ink={c.text} paper={c.surface} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, opacity: done ? 0.45 : 1, fontSize: 13.5, fontWeight: '600' }}>{d.title}</Text>
                  <Text style={{ color: c.textFaint, fontSize: 11, marginTop: 1 }}>{done ? 'Paid' : `Due ${d.due}`}</Text>
                </View>
                <Text style={{ color: c.text, opacity: done ? 0.45 : 1, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  <Text style={{ fontSize: 9.5, opacity: 0.5, fontWeight: '500' }}>BDT </Text>
                  {d.amount}
                </Text>
              </View>
            )
          })}
          <View style={{ height: 4, borderRadius: 2, backgroundColor: c.surfaceMuted, marginTop: 4, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: c.text }, barStyle]} />
          </View>
        </Card>
      </Layer>
      <Layer progress={progress} width={width} factor={-0.2} style={{ position: 'absolute', top: 6, left: Math.max(8, width / 2 - 158) }}>
        <Chip>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={12} color={c.text} strokeWidth={2} />
          </View>
          <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>EMI due Sunday</Text>
        </Chip>
      </Layer>
    </View>
  )
}

/* ───────────────────────── 3 · Know who owes you ───────────────────────── */

const OWE_STEPS = [1000, 1700, 1900, 900] as const

export function PeopleArt({ active, progress, width }: ArtProps) {
  const c = useInk()
  const step = useLoop(active, OWE_STEPS, 2)
  const paidBack = step >= 2
  const bar = useSharedValue(0.4)
  useEffect(() => {
    bar.value = withTiming(paidBack ? 1 : 0.4, { duration: paidBack ? 700 : duration.base, easing: easing.out })
  }, [paidBack, bar])
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }))
  const bell = useSharedValue(0)
  useEffect(() => {
    if (step === 1) bell.value = withSequence(withTiming(1, { duration: 90 }), withSpring(0, spring.bouncy))
  }, [step, bell])
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - bell.value * 0.12 }, { rotate: `${bell.value * -14}deg` }] }))

  return (
    <View style={{ width, height: ART_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <Halo progress={progress} width={width} />
      <Layer progress={progress} width={width} factor={0.12} style={{ marginTop: -48 }}>
        <Card style={{ width: 256, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: categoryTint('violet', c.scheme), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>RK</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>Rafiq Karim</Text>
              <Text style={{ color: c.textFaint, fontSize: 11.5, marginTop: 1 }}>Lent on 2 Sep</Text>
            </View>
            <Animated.View style={[{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, bellStyle]}>
              <Bell size={15} color={c.text} strokeWidth={2} />
            </Animated.View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 }}>
            <View>
              <Text style={{ color: c.textFaint, fontSize: 11.5 }}>{paidBack ? 'Paid back' : 'Owes you'}</Text>
              {paidBack ? (
                <Animated.View key="settled" entering={popIn} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 31, marginTop: 2 }}>
                  <Tick on size={20} ink={c.text} paper={c.surface} />
                  <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }}>Settled</Text>
                </Animated.View>
              ) : (
                <Text style={{ color: c.positive, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'], marginTop: 2, height: 31 }}>
                  <Text style={{ fontSize: 14, opacity: 0.55, fontWeight: '500' }}>BDT </Text>
                  3,000
                </Text>
              )}
            </View>
            <Text style={{ color: c.textMuted, fontSize: 11.5, fontVariant: ['tabular-nums'], marginBottom: 4 }}>{paidBack ? '5,000 of 5,000' : '2,000 of 5,000'}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceMuted, marginTop: 10, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: c.positive }, barStyle]} />
          </View>
        </Card>
      </Layer>
      {/* The reminder leaves the bell and lands below the card. */}
      <Layer progress={progress} width={width} factor={-0.2} style={{ position: 'absolute', top: ART_HEIGHT / 2 + 58, right: Math.max(10, width / 2 - 140) }}>
        {step === 1 || step === 2 ? (
          <Animated.View entering={popIn} exiting={FadeOut.duration(duration.base)} style={{ alignItems: 'flex-end' }}>
            <Svg width={14} height={8} style={{ marginRight: 22, marginBottom: -1 }}>
              <Path d="M0 8 L7 0 L14 8 Z" fill={c.brand} />
            </Svg>
            <View style={{ maxWidth: 220, backgroundColor: c.brand, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10 }}>
              <Text style={{ color: c.brandFg, fontSize: 12.5, lineHeight: 17 }}>Hi Rafiq! A friendly reminder about the BDT 3,000. Thanks!</Text>
            </View>
            <Text style={{ color: c.textFaint, fontSize: 10.5, marginTop: 4, marginRight: 4 }}>Reminder sent</Text>
          </Animated.View>
        ) : null}
      </Layer>
      <Layer progress={progress} width={width} factor={-0.3} style={{ position: 'absolute', top: 18, left: Math.max(8, width / 2 - 150) }}>
        {step === 2 && (
          <Animated.View entering={popIn} exiting={FadeOut.duration(duration.fast)}>
            <Chip>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.positive, marginLeft: 4 }} />
              <Text style={{ color: c.positive, fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>+ BDT 3,000 received</Text>
            </Chip>
          </Animated.View>
        )}
      </Layer>
    </View>
  )
}

/* ───────────────────────── 4 · Private. Works offline. ───────────────────────── */

const SYNC_STEPS = [1500, 1100, 1900] as const
const ORBIT = 228

export function PrivateArt({ active, progress, width }: ArtProps) {
  const c = useInk()
  const { reduced } = useMotion()
  const step = useLoop(active, SYNC_STEPS, 2)
  const shackle = useSharedValue(reduced ? 0 : -12)
  const spin = useSharedValue(0)
  const orbit = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    if (!active) {
      shackle.value = withTiming(-12, { duration: duration.fast })
      return
    }
    shackle.value = withDelay(260, withSpring(0, spring.bouncy))
    orbit.value = withRepeat(withTiming(orbit.value + 360, { duration: 24000, easing: Easing.linear }), -1, false)
    return () => cancelAnimation(orbit)
  }, [active, reduced, shackle, orbit])
  useEffect(() => {
    if (reduced || step !== 1) return
    spin.value = 0
    spin.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1, false)
    return () => cancelAnimation(spin)
  }, [step, reduced, spin])

  const shackleStyle = useAnimatedStyle(() => ({ transform: [{ translateY: shackle.value }] }))
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value}deg` }] }))
  const upright = useAnimatedStyle(() => ({ transform: [{ rotate: `${-orbit.value}deg` }] }))
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }))

  const status =
    step === 0
      ? { icon: <CloudOff size={13} color={c.textMuted} strokeWidth={2} />, text: 'Offline · saved on this phone' }
      : step === 1
        ? {
            icon: (
              <Animated.View style={spinStyle}>
                <RefreshCw size={13} color={c.text} strokeWidth={2} />
              </Animated.View>
            ),
            text: 'Back online · syncing',
          }
        : { icon: <Tick on size={15} ink={c.text} paper={c.surface} />, text: 'Synced · only you can see it' }

  return (
    <View style={{ width, height: ART_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <Halo progress={progress} width={width} />
      <Layer progress={progress} width={width} factor={0.3} style={{ position: 'absolute', width: ORBIT, height: ORBIT, top: (ART_HEIGHT - ORBIT) / 2 - 18 }}>
        <Animated.View style={[{ width: ORBIT, height: ORBIT }, orbitStyle]}>
          <Svg width={ORBIT} height={ORBIT} style={{ position: 'absolute' }}>
            <Circle cx={ORBIT / 2} cy={ORBIT / 2} r={ORBIT / 2 - 18} stroke={c.textFaint} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="2 6" strokeLinecap="round" fill="none" />
          </Svg>
          <Animated.View style={[{ position: 'absolute', left: ORBIT / 2 - 17, top: 1 }, upright]}>
            <OrbitNode>
              <Smartphone size={15} color={c.text} strokeWidth={1.9} />
            </OrbitNode>
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: ORBIT / 2 - 17, bottom: 1 }, upright]}>
            <OrbitNode>
              <Cloud size={15} color={c.text} strokeWidth={1.9} />
            </OrbitNode>
          </Animated.View>
        </Animated.View>
      </Layer>
      <Layer progress={progress} width={width} factor={0.1} style={{ alignItems: 'center', marginTop: -36 }}>
        <View style={{ width: 92, height: 112, alignItems: 'center' }}>
          <Animated.View style={[{ position: 'absolute', top: 0 }, shackleStyle]}>
            <Svg width={64} height={60} viewBox="0 0 64 60">
              <Path d="M14 58V30a18 18 0 0 1 36 0v28" stroke={c.text} strokeWidth={9} strokeLinecap="round" fill="none" />
            </Svg>
          </Animated.View>
          <View style={{ position: 'absolute', bottom: 0, width: 92, height: 72, borderRadius: 22, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={16} height={26} viewBox="0 0 16 26">
              <Circle cx={8} cy={8} r={7} fill={c.page} />
              <Rect x={5} y={10} width={6} height={14} rx={3} fill={c.page} />
            </Svg>
          </View>
        </View>
      </Layer>
      <Layer progress={progress} width={width} factor={-0.16} style={{ position: 'absolute', bottom: 22 }}>
        <Animated.View key={step} entering={reduced ? undefined : FadeIn.duration(duration.base)}>
          <Chip>
            <View style={{ width: 18, alignItems: 'center' }}>{status.icon}</View>
            <Text style={{ color: c.text, fontSize: 12.5, fontWeight: '600' }}>{status.text}</Text>
          </Chip>
        </Animated.View>
      </Layer>
    </View>
  )
}

function OrbitNode({ children }: { children: ReactNode }) {
  const c = useInk()
  return (
    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
  )
}
