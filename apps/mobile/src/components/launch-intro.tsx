import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Appearance, StyleSheet, View } from 'react-native'
import Animated, {
  runOnJS,
  useFrameCallback,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { BRAND_COLORS, H_PATH, SPLASH_TILE_DP, TILE_RADIUS } from '@/lib/brand-geometry'
import { introPlan, type IntroPlan } from '@/lib/first-run-model'
import { easing, spring, useMotion } from '@/lib/motion'
import { Wordmark } from './brand'

/**
 * The app underneath mounts only once the intro has scheduled its motion (a frame or two after launch):
 * mounting is the heaviest JS work at startup and would otherwise delay the intro's first beat.
 */
let released = false
const listeners = new Set<() => void>()
function releaseApp() {
  if (released) return
  released = true
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useAppReleased = () => useSyncExternalStore(subscribe, () => released)

/** The native splash fades over this long; the intro holds its (identical) first frame until it's gone. */
export const SPLASH_FADE_MS = 120
const TILE = SPLASH_TILE_DP
const GAP = Math.round(TILE * 0.28)
const SHEEN_W = TILE * 0.9

interface LaunchIntroProps {
  /** The app underneath can be shown (session and first-run flags read). */
  ready: boolean
  /** Flags read: whether this is the first launch is known. */
  planReady: boolean
  firstLaunch: boolean
}

/**
 * Animated brand intro that takes over from the native splash. Its first frame is the splash exactly (page
 * colour, H tile centred at the splash size), so hiding the splash is invisible; then the tile settles with
 * a sheen, the wordmark slides out beside it (first launch), and the overlay lifts away to reveal the app.
 * It never holds the app back past the plan's minimum: if the app is ready sooner, it leaves at `minMs`.
 */
export function LaunchIntro({ ready, planReady, firstLaunch }: LaunchIntroProps) {
  const { reduced } = useMotion()
  // The OS splash follows the system theme, not the in-app preference: match it for the handoff.
  const [scheme] = useState<'light' | 'dark'>(() => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'))
  const c = BRAND_COLORS[scheme]
  const [done, setDone] = useState(false)
  const [laidOut, setLaidOut] = useState(false)
  const [wordW, setWordW] = useState(0)
  const [plan, setPlan] = useState<IntroPlan | null>(null)
  /** The opening has played to its minimum: the overlay may leave as soon as the app is ready. */
  const [opened, setOpened] = useState(false)
  const exiting = useRef(false)

  const tileScale = useSharedValue(1)
  const shift = useSharedValue(0)
  const sheen = useSharedValue(0)
  const word = useSharedValue(0)
  const veil = useSharedValue(1)
  const lift = useSharedValue(1)
  const gate = useSharedValue(0)
  /** Set from JS once the plan is known: 0 = not yet, 1 = fade, 2 = short, 3 = full. */
  const armed = useSharedValue(0)
  const wordShift = useSharedValue(0)
  const minMs = useSharedValue(0)
  const smooth = useSharedValue(0)
  const armedAt = useSharedValue(-1)
  const started = useSharedValue(false)

  const onLayout = () => {
    if (laidOut) return
    SplashScreen.hide()
    setLaidOut(true)
  }

  const markOpened = () => setOpened(true)
  /**
   * The timeline starts on the UI thread, once frames are flowing smoothly (3 in a row under 40 ms). At
   * startup the UI thread can be busy for a moment (native modules waking up); time-based animations
   * would then jump to their end unseen. Waiting for smooth frames means the motion is actually shown.
   */
  const ticker = useFrameCallback((f) => {
    'worklet'
    if (!armed.value || started.value) return
    if (armedAt.value < 0) armedAt.value = f.timestamp
    smooth.value = (f.timeSincePreviousFrame ?? 999) < 40 ? smooth.value + 1 : 0
    // Never wait forever for smooth frames.
    if (smooth.value < 3 && f.timestamp - armedAt.value < 1500) return
    started.value = true
    const kind = armed.value
    if (kind >= 2) {
      const delay = SPLASH_FADE_MS
      tileScale.value = withDelay(delay, withSequence(withTiming(kind === 3 ? 0.9 : 0.94, { duration: 120, easing: easing.inOut }), withSpring(1, spring.bouncy)))
      sheen.value = withDelay(delay + 60, withTiming(1, { duration: kind === 3 ? 560 : 380, easing: easing.inOut }))
      if (kind === 3 && wordShift.value) {
        shift.value = withDelay(delay + 200, withSpring(wordShift.value, spring.gentle))
        word.value = withDelay(delay + 250, withTiming(1, { duration: 340, easing: easing.out }))
      }
    }
    gate.value = withTiming(1, { duration: (kind >= 2 ? SPLASH_FADE_MS : 0) + minMs.value }, (fin) => {
      if (fin) runOnJS(markOpened)()
    })
  }, false)

  // Once laid out, the flags are read and the wordmark measured: arm the timeline, then let the app mount.
  const [wordTimedOut, setWordTimedOut] = useState(false)
  useEffect(() => {
    if (!laidOut || wordW) return
    const t = setTimeout(() => setWordTimedOut(true), 300)
    return () => clearTimeout(t)
  }, [laidOut, wordW])
  useEffect(() => {
    if (!laidOut || !planReady || plan || (!wordW && !wordTimedOut)) return
    const p = introPlan(firstLaunch, reduced)
    setPlan(p)
    minMs.value = p.minMs
    wordShift.value = p.wordmark && wordW ? -(wordW + GAP) / 2 : 0
    armed.value = p.kind === 'full' ? 3 : p.kind === 'short' ? 2 : 1
    ticker.setActive(true)
    releaseApp()
  }, [laidOut, planReady, plan, wordW, wordTimedOut, firstLaunch, reduced, minMs, wordShift, armed, ticker])

  // Leave once the opening has played and the app is ready.
  useEffect(() => {
    const p = plan
    if (!ready || !opened || !p || exiting.current) return
    exiting.current = true
    ticker.setActive(false)
    const finish = () => setDone(true)
    veil.value = withTiming(0, { duration: p.exitMs, easing: easing.out }, (fin) => {
      if (fin) runOnJS(finish)()
    })
    if (p.kind !== 'fade') lift.value = withTiming(1.06, { duration: p.exitMs, easing: easing.out })
  }, [plan, ready, opened, veil, lift, ticker])

  // Safety net: never hold the app back or trap the user behind the intro (e.g. a stuck layout callback).
  useEffect(() => {
    const t = setTimeout(releaseApp, 1500)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setDone(true), 4000)
    return () => clearTimeout(t)
  }, [ready])

  const rootStyle = useAnimatedStyle(() => ({ opacity: veil.value }))
  const groupStyle = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }))
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }, { scale: tileScale.value }] }))
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -SHEEN_W + sheen.value * (TILE + SHEEN_W) }, { skewX: '-18deg' }] }))
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateX: shift.value + (1 - word.value) * -14 }],
  }))

  if (done) return null
  return (
    <Animated.View
      onLayout={onLayout}
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: c.page, zIndex: 1000, elevation: 1000 }, rootStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, groupStyle]}>
        <Animated.View style={[{ width: TILE, height: TILE, borderRadius: (TILE * TILE_RADIUS) / 100, overflow: 'hidden' }, tileStyle]}>
          {/* Layered so the sheen passes over the tile but under the glyph (identical to BrandMark at rest). */}
          <Svg width={TILE} height={TILE} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="intro-hl" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={scheme === 'light' ? 0.07 : 0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={100} height={100} rx={TILE_RADIUS} fill={c.tile} />
            <Rect x={0} y={0} width={100} height={100} rx={TILE_RADIUS} fill="url(#intro-hl)" />
          </Svg>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -TILE * 0.2, bottom: -TILE * 0.2, width: SHEEN_W }, sheenStyle]}>
            <Svg width={SHEEN_W} height={TILE * 1.4}>
              <Defs>
                <LinearGradient id="intro-sheen" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={scheme === 'light' ? 0.22 : 0.85} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={SHEEN_W} height={TILE * 1.4} fill="url(#intro-sheen)" />
            </Svg>
          </Animated.View>
          <Svg width={TILE} height={TILE} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Path d={H_PATH} fill={c.glyph} />
          </Svg>
        </Animated.View>
        {/* Laid out beside the tile's centre position; slides out as the tile makes room. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', marginLeft: TILE / 2 + GAP, top: 0, bottom: 0, justifyContent: 'center' }}>
          <Animated.View style={wordStyle} onLayout={(e) => setWordW(Math.round(e.nativeEvent.layout.width))}>
            <Wordmark size={TILE} color={c.tile} />
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  )
}
