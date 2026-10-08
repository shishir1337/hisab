import { useCallback, useRef, useState, type ComponentType } from 'react'
import { Text, useWindowDimensions, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandLockup } from '@/components/brand'
import { Button } from '@/components/button'
import { Press } from '@/components/press'
import { ART_HEIGHT, DueArt, PeopleArt, PrivateArt, QuickLogArt, type ArtProps } from '@/components/walkthrough-art'
import { useFirstRun } from '@/lib/first-run'
import { duration, haptic, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'

const SLIDES: { title: string; body: string; Art: ComponentType<ArtProps> }[] = [
  { title: 'Log money in 3 seconds', body: 'Tap the amount, pick a category, done. No forms, no fuss.', Art: QuickLogArt },
  { title: 'Never miss an EMI or bill', body: 'See what’s due this week and tick it off the moment it’s paid.', Art: DueArt },
  { title: 'Know who owes you', body: 'Keep track of money you lend, and send a friendly reminder.', Art: PeopleArt },
  { title: 'Private. Works offline.', body: 'Your data stays yours. Log anything without internet; it syncs when you’re back.', Art: PrivateArt },
]

/**
 * First-launch walkthrough (signed out only). Finishing or skipping sets a device-local flag; the root
 * stack's guard then drops this screen and sign-in takes its place — it never shows again.
 */
export default function Welcome() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { markWelcomeSeen } = useFirstRun()
  const { reduced } = useMotion()
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const x = useSharedValue(0)
  const [page, setPage] = useState(0)
  const pageRef = useRef(0)
  const last = page === SLIDES.length - 1
  // Short phones: shrink the illustration rather than crowd the copy.
  const artScale = Math.min(1, Math.max(0.78, (height - insets.top - insets.bottom - 330) / ART_HEIGHT))

  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x
  })
  const changed = useCallback((p: number) => {
    if (p === pageRef.current) return
    pageRef.current = p
    setPage(p)
    haptic.selection()
  }, [])
  useAnimatedReaction(
    () => Math.round(x.value / width),
    (p, prev) => {
      if (p !== prev && prev !== null) runOnJS(changed)(p)
    },
    [width],
  )

  const finish = () => {
    haptic.light()
    markWelcomeSeen()
  }
  const next = () => {
    if (last) return finish()
    scrollRef.current?.scrollTo({ x: (pageRef.current + 1) * width, animated: !reduced })
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
        <BrandLockup size={28} />
        {!last && (
          <Animated.View entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.fast)}>
            <Press accessibilityRole="button" accessibilityLabel="Skip the introduction" onPress={finish} hitSlop={12} style={{ paddingVertical: 8, paddingHorizontal: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '600' }}>Skip</Text>
            </Press>
          </Animated.View>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <Slide key={s.title} index={i} x={x} width={width} active={page === i} artScale={artScale} {...s} />
        ))}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: 24, gap: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityRole="progressbar" accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <Dot key={i} index={i} x={x} width={width} />
          ))}
        </View>
        <Button onPress={next} accessibilityLabel={last ? 'Get started' : 'Next'}>
          {last ? 'Get started' : 'Next'}
        </Button>
      </View>
    </View>
  )
}

function Slide({ index, x, width, active, artScale, title, body, Art }: { index: number; x: SharedValue<number>; width: number; active: boolean; artScale: number } & (typeof SLIDES)[number]) {
  const { colors } = useTheme()
  const progress = useDerivedValue(() => (x.value - index * width) / width)
  const text = useAnimatedStyle(() => {
    const p = progress.value
    return { opacity: interpolate(Math.abs(p), [0, 0.6], [1, 0], 'clamp'), transform: [{ translateX: p * width * 0.28 }] }
  })
  const art = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(progress.value), [0, 0.9], [1, 0.2], 'clamp') }))
  return (
    <View style={{ width, flex: 1, justifyContent: 'center', paddingBottom: 16 }} accessible accessibilityLabel={`${title}. ${body}`}>
      <Animated.View style={[{ height: ART_HEIGHT * artScale, alignItems: 'center', justifyContent: 'center' }, art]} importantForAccessibility="no-hide-descendants">
        <View style={{ transform: [{ scale: artScale }] }}>
          <Art active={active} progress={progress} width={width} />
        </View>
      </Animated.View>
      <Animated.View style={[{ paddingHorizontal: 32, marginTop: 28 }, text]}>
        <Text style={{ color: colors.text, fontSize: 27, fontWeight: '700', letterSpacing: -0.7, textAlign: 'center' }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 15.5, lineHeight: 22, textAlign: 'center', marginTop: 10 }}>{body}</Text>
      </Animated.View>
    </View>
  )
}

function Dot({ index, x, width }: { index: number; x: SharedValue<number>; width: number }) {
  const { colors } = useTheme()
  const a = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(x.value / width - index))
    return { width: interpolate(d, [0, 1], [22, 6]), opacity: interpolate(d, [0, 1], [1, 0.22]) }
  })
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: colors.text }, a]} />
}
