import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { duration, easing, haptic as haptics, pressTarget, spring } from '@/lib/motion'

export type PressFeedback = 'opacity' | 'scale' | 'soft' | 'none'

type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode
  className?: string
  style?: StyleProp<ViewStyle>
  /** opacity: rows and text links · scale: buttons and tiles · soft: subtle opacity for big surfaces. */
  feedback?: PressFeedback
  /** Extra style while pressed (e.g. a darker background on keypad keys). */
  pressedStyle?: StyleProp<ViewStyle>
  /** Scale while pressed for `scale` feedback (default 0.97). */
  pressScale?: number
  haptic?: 'selection' | 'light' | false
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Pressable with real press feedback that survives NativeWind and runs on the UI thread.
 *
 * Press-in eases quickly to the pressed state; release springs back, so a quick tap still reads as a
 * press. css-interop drops a function `style={({ pressed }) => …}` whenever `className` is also set, so
 * styles stay plain arrays here. A static `opacity` in `style` (e.g. disabled at 0.5) is preserved: the
 * pressed opacity multiplies it.
 */
export function Press({ feedback = 'opacity', pressedStyle, pressScale = pressTarget.scale, style, haptic = false, onPressIn, onPressOut, onPress, disabled, ...rest }: PressProps) {
  const p = useSharedValue(0)
  const [pressed, setPressed] = useState(false)
  const baseOpacity = (StyleSheet.flatten(style)?.opacity as number | undefined) ?? 1
  const dim = feedback === 'opacity' ? pressTarget.opacity : feedback === 'soft' ? pressTarget.soft : feedback === 'scale' ? 0.9 : 1
  const shrink = feedback === 'scale' ? 1 - pressScale : 0

  const animated = useAnimatedStyle(() => {
    if (feedback === 'none') return {}
    const s = { opacity: baseOpacity * (1 - p.value * (1 - dim)) }
    return shrink ? { ...s, transform: [{ scale: 1 - p.value * shrink }] } : s
  }, [feedback, baseOpacity, dim, shrink])

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        p.value = withTiming(1, { duration: duration.press, easing: easing.out })
        if (pressedStyle) setPressed(true)
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        p.value = feedback === 'scale' ? withSpring(0, spring.press) : withTiming(0, { duration: duration.fast, easing: easing.out })
        if (pressedStyle) setPressed(false)
        onPressOut?.(e)
      }}
      onPress={(e) => {
        if (haptic === 'selection') haptics.selection()
        else if (haptic === 'light') haptics.light()
        onPress?.(e)
      }}
      style={[style, animated, pressed && !disabled ? pressedStyle : null]}
    />
  )
}
