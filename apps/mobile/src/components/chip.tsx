import { useEffect, useRef, type ReactNode } from 'react'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { duration, easing, spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

interface ChipProps {
  label: string
  /** A node, or a render function given the right foreground colour for the selected state. */
  icon?: ReactNode | ((color: string) => ReactNode)
  selected?: boolean
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  size?: 'md' | 'sm'
  /** Quiet chip on a muted panel (no border), e.g. inside the quick-log sheet's meta row. */
  tone?: 'outline' | 'muted'
}

/**
 * Choice chip (same as web): selected = ink fill; unselected = quiet outline on a white surface.
 * Selecting cross-fades the fill and gives a small spring, so the choice visibly "lands".
 */
export function Chip({ label, icon, selected = false, onPress, onLongPress, accessibilityLabel, size = 'md', tone = 'outline' }: ChipProps) {
  const { colors } = useTheme()
  const { reduced } = useMotion()
  const sm = size === 'sm'
  const on = useSharedValue(selected ? 1 : 0)
  const pop = useSharedValue(1)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    on.value = reduced ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: duration.fast, easing: easing.out })
    if (selected && !reduced) pop.value = withSequence(withTiming(0.92, { duration: duration.press, easing: easing.out }), withSpring(1, spring.bouncy))
  }, [selected, reduced, on, pop])

  const offBg = tone === 'muted' ? colors.surfaceMuted : colors.surface
  const offBorder = tone === 'muted' ? colors.surfaceMuted : colors.border
  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [offBg, colors.brand]),
    borderColor: interpolateColor(on.value, [0, 1], [offBorder, colors.brand]),
    transform: [{ scale: pop.value }],
  }))
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [colors.text, colors.brandFg]) }))

  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      haptic="selection"
      onPress={onPress}
      onLongPress={onLongPress}
      // Visual 32–36dp; hit slop takes the touch target to ≥ 44dp (spec §7.5).
      hitSlop={sm ? 8 : 6}
      feedback="soft"
      style={{ flexShrink: 0 }}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            paddingHorizontal: sm ? 11 : 14,
            height: sm ? 32 : 36,
          },
          fill,
        ]}
      >
        {typeof icon === 'function' ? icon(selected ? colors.brandFg : colors.textMuted) : icon}
        <Animated.Text numberOfLines={1} style={[{ fontSize: sm ? 12.5 : 13.5, fontWeight: selected ? '600' : '500', maxWidth: 220 }, ink]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Press>
  )
}
