import type { Tabs } from 'expo-router'
import { Home, ListOrdered, Plus, Target, Users, type LucideIcon } from 'lucide-react-native'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuickLog } from '@/features/quick-log/provider'
import { duration, easing, haptic, spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: Home, label: 'Home' },
  activity: { icon: ListOrdered, label: 'Activity' },
  plan: { icon: Target, label: 'Plan' },
  people: { icon: Users, label: 'People' },
}

/** Height of the tab row above the system navigation inset. */
export const TAB_BAR_HEIGHT = 64
const PILL_W = 56
const PILL_H = 30

/** Four tabs plus the floating + that opens quick log. Spec §7.2. One ink pill slides to the active tab. */
export function TabBar({ state, navigation }: TabBarProps) {
  const { colors, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  const quickLog = useQuickLog()
  const { reduced } = useMotion()
  const routes = state.routes.filter((r) => ICONS[r.name])
  const active = Math.max(0, routes.findIndex((r) => r.key === state.routes[state.index]?.key))

  // Pill geometry comes from layout: the row's width and where the icon box sits inside a tab.
  const [rowW, setRowW] = useState(0)
  const [pillY, setPillY] = useState<number | null>(null)
  const tabW = rowW / Math.max(1, routes.length)
  const x = useSharedValue(0)
  const placed = useRef(false)
  const slideTo = (i: number, animate: boolean) => {
    if (!tabW) return
    const to = i * tabW + (tabW - PILL_W) / 2
    x.value = animate && !reduced ? withSpring(to, spring.snappy) : to
  }
  useEffect(() => {
    slideTo(active, placed.current)
    if (tabW) placed.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabW, reduced])
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))

  return (
    <View pointerEvents="box-none">
      <Press
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        haptic="light"
        feedback="scale"
        pressScale={0.92}
        onPress={() => quickLog.open()}
        style={{
          position: 'absolute',
          right: 18,
          bottom: TAB_BAR_HEIGHT + insets.bottom + 16,
          width: 58,
          height: 58,
          borderRadius: 29,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.brand,
          shadowColor: '#000',
          shadowOpacity: scheme === 'dark' ? 0.5 : 0.22,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Plus color={colors.brandFg} size={26} strokeWidth={2.2} />
      </Press>

      <View
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          backgroundColor: colors.page,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          height: TAB_BAR_HEIGHT + insets.bottom,
        }}
      >
        {/* Pill behind the active icon: Android's native tab language, in ink instead of a hue. Keyed by theme:
            changing the background of a live view dropped its radius on Fabric. */}
        {tabW > 0 && pillY !== null && (
          <Animated.View
            key={scheme}
            pointerEvents="none"
            style={[
              { position: 'absolute', left: 0, top: pillY, width: PILL_W, height: PILL_H, borderRadius: PILL_H / 2, backgroundColor: scheme === 'dark' ? colors.surfaceMuted : colors.border },
              pill,
            ]}
          />
        )}
        {routes.map((route, i) => (
          <TabItem
            key={route.key}
            meta={ICONS[route.name]!}
            focused={i === active}
            onIconLayout={i === 0 ? (y) => setPillY(y) : undefined}
            onPress={() => {
              const focused = i === active
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!focused && !event.defaultPrevented) {
                haptic.selection()
                // Start the slide now, on the UI thread, while the JS thread mounts the next screen.
                slideTo(i, true)
                navigation.navigate(route.name, route.params)
              }
            }}
          />
        ))}
      </View>
    </View>
  )
}

function TabItem({ meta, focused, onPress, onIconLayout }: { meta: { icon: LucideIcon; label: string }; focused: boolean; onPress: () => void; onIconLayout?: (y: number) => void }) {
  const { colors } = useTheme()
  const { reduced } = useMotion()
  const s = useSharedValue(1)
  const first = useRef(true)
  // Selected: the icon pops once as the pill arrives.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (focused && !reduced) s.value = withSequence(withTiming(0.86, { duration: duration.press, easing: easing.out }), withSpring(1, spring.bouncy))
  }, [focused, reduced, s])
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }))
  const Icon = meta.icon
  const color = focused ? colors.text : colors.textFaint
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={meta.label}
      onPressIn={() => {
        if (!reduced) s.value = withTiming(0.9, { duration: duration.press, easing: easing.out })
      }}
      onPressOut={() => {
        s.value = withSpring(1, spring.press)
      }}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}
    >
      <Animated.View onLayout={onIconLayout ? (e) => onIconLayout(e.nativeEvent.layout.y) : undefined} style={[{ width: PILL_W, height: PILL_H, alignItems: 'center', justifyContent: 'center' }, icon]}>
        <Icon color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
      </Animated.View>
      <Text style={{ color, fontSize: 11, fontWeight: focused ? '600' : '500', letterSpacing: 0.1 }}>{meta.label}</Text>
    </Pressable>
  )
}
