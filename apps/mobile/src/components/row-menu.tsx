import type { LucideIcon } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { duration, easing, spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

export interface RowMenuItem {
  label: string
  icon: LucideIcon
  danger?: boolean
  onPress: () => void
}

const ITEM_H = 48
const WIDTH = 220

/**
 * Small context menu for a long-pressed row. It opens next to the finger (clamped to the screen), scales in
 * from the touch point and runs the chosen action only after it has closed, so the list underneath is
 * visible when the action's own animation (e.g. a row collapsing) starts.
 */
export function RowMenu({ at, title, items, onClose }: { at: { x: number; y: number } | null; title?: string; items: RowMenuItem[]; onClose: () => void }) {
  const { colors, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { reduced } = useMotion()
  const p = useSharedValue(0)
  const pending = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!at) return
    p.value = 0
    p.value = reduced ? withTiming(1, { duration: duration.fast }) : withSpring(1, spring.snappy)
  }, [at, p, reduced])

  const finish = () => {
    const run = pending.current
    pending.current = null
    onClose()
    run?.()
  }
  const close = (then?: () => void) => {
    pending.current = then ?? null
    p.value = withTiming(0, { duration: duration.fast, easing: easing.in }, (done) => {
      'worklet'
      if (done) scheduleOnRN(finish)
    })
  }

  const menuH = items.length * ITEM_H + (title ? 34 : 0) + 12
  const top = at ? Math.min(Math.max(at.y - 24, insets.top + 8), height - insets.bottom - menuH - 16) : 0
  const left = at ? Math.min(Math.max(at.x - WIDTH / 2, 16), width - WIDTH - 16) : 0
  // Scale from the side of the menu nearest the finger.
  const originY = at ? Math.min(Math.max(at.y - top, 0), menuH) : 0

  const card = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * (originY - menuH / 2) * 0.12 }, { scale: 0.88 + 0.12 * p.value }],
  }))
  const backdrop = useAnimatedStyle(() => ({ opacity: p.value }))

  return (
    <Modal visible={at !== null} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close()}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)' }, backdrop]}>
        <Pressable accessibilityLabel="Close menu" style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>
      <Animated.View
        accessibilityRole="menu"
        style={[
          {
            position: 'absolute',
            top,
            left,
            width: WIDTH,
            borderRadius: 16,
            paddingVertical: 6,
            backgroundColor: scheme === 'dark' ? colors.surfaceMuted : colors.surface,
            borderWidth: scheme === 'dark' ? 1 : 0,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 16,
          },
          card,
        ]}
      >
        {title ? (
          <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 12.5, fontWeight: '500', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 }}>
            {title}
          </Text>
        ) : null}
        {items.map((it, i) => {
          const Icon = it.icon
          const fg = it.danger ? colors.danger : colors.text
          return (
            <View key={it.label}>
              {it.danger && i > 0 ? <View style={{ height: 1, marginVertical: 4, marginHorizontal: 12, backgroundColor: colors.borderSubtle }} /> : null}
              <Press
                accessibilityRole="menuitem"
                accessibilityLabel={it.label}
                haptic="selection"
                feedback="none"
                pressedStyle={{ backgroundColor: colors.surfaceMuted }}
                onPress={() => close(it.onPress)}
                style={{ height: ITEM_H - (it.danger && i > 0 ? 9 : 0), marginHorizontal: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 }}
              >
                <Icon size={18} color={fg} strokeWidth={2} />
                <Text style={{ color: fg, fontSize: 15, fontWeight: '500' }}>{it.label}</Text>
              </Press>
            </View>
          )
        })}
      </Animated.View>
    </Modal>
  )
}
