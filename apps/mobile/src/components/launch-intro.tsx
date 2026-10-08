import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Appearance, StyleSheet, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { BRAND_COLORS, SPLASH_TILE_DP, TILE_RADIUS } from '@/lib/brand-geometry'
import { introPlan, type IntroPlan } from '@/lib/first-run-model'
import { easing, spring, useMotion } from '@/lib/motion'
import { BrandMark, Wordmark } from './brand'

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
  /** When the motion starts (the splash has finished fading). */
  const t0 = useRef(0)
  const exiting = useRef(false)

  const tileScale = useSharedValue(1)
  const shift = useSharedValue(0)
  const sheen = useSharedValue(0)
  const word = useSharedValue(0)
  const veil = useSharedValue(1)
  const lift = useSharedValue(1)

  const onLayout = () => {
    if (t0.current) return
    SplashScreen.hide()
    t0.current = Date.now() + SPLASH_FADE_MS
    setLaidOut(true)
  }

  // Once laid out, the flags are read and the wordmark measured: schedule the whole timeline on the UI
  // thread in one go, then let the app mount underneath (mounting keeps JS busy; the motion doesn't care).
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
    if (p.kind !== 'fade') {
      const lag = Math.max(0, t0.current - Date.now())
      tileScale.value = withDelay(lag, withSequence(withTiming(0.92, { duration: 130, easing: easing.inOut }), withSpring(1, spring.bouncy)))
      sheen.value = withDelay(lag + 80, withTiming(1, { duration: 540, easing: easing.inOut }))
      if (p.wordmark && wordW) {
        shift.value = withDelay(lag + 200, withSpring(-(wordW + GAP) / 2, spring.gentle))
        word.value = withDelay(lag + 250, withTiming(1, { duration: 340, easing: easing.out }))
      }
    }
    releaseApp()
  }, [laidOut, planReady, plan, wordW, wordTimedOut, firstLaunch, reduced, tileScale, sheen, shift, word])

  // Leave at the plan's minimum, or as soon as the app is ready after that.
  useEffect(() => {
    const p = plan
    if (!ready || !p || exiting.current) return
    const wait = Math.max(0, p.minMs - (Date.now() - t0.current))
    const t = setTimeout(() => {
      exiting.current = true
      const finish = () => setDone(true)
      veil.value = withTiming(0, { duration: p.exitMs, easing: easing.out }, (fin) => {
        if (fin) runOnJS(finish)()
      })
      if (p.kind !== 'fade') lift.value = withTiming(1.06, { duration: p.exitMs, easing: easing.out })
    }, wait)
    return () => clearTimeout(t)
  }, [plan, ready, veil, lift])

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
          <BrandMark size={TILE} scheme={scheme} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -TILE * 0.2, bottom: -TILE * 0.2, width: SHEEN_W }, sheenStyle]}>
            <Svg width={SHEEN_W} height={TILE * 1.4}>
              <Defs>
                <LinearGradient id="intro-sheen" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={scheme === 'light' ? 0.22 : 0.7} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={SHEEN_W} height={TILE * 1.4} fill="url(#intro-sheen)" />
            </Svg>
          </Animated.View>
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
