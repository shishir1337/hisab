import { Check } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import Animated, { FadeIn, withSpring, withTiming, type EntryAnimationsValues } from 'react-native-reanimated'
import { duration, easing, spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

interface ButtonProps {
  children: ReactNode
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  icon?: ReactNode
  disabled?: boolean
  loading?: boolean
  /** Morphs the label into a ✓ (e.g. saved, just before a sheet closes). */
  done?: boolean
  accessibilityLabel?: string
}

/** Spinner shows only if work takes longer than this — a local write never flashes one. */
const SPINNER_DELAY = 180

const checkIn = (_v: EntryAnimationsValues) => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.4 }, { rotate: '-30deg' }] },
    animations: {
      opacity: withTiming(1, { duration: duration.fast, easing: easing.out }),
      transform: [{ scale: withSpring(1, spring.bouncy) }, { rotate: withSpring('0deg', spring.bouncy) }],
    },
  }
}

export function Button({ children, onPress, variant = 'primary', size = 'md', icon, disabled, loading, done, accessibilityLabel }: ButtonProps) {
  const { colors } = useTheme()
  const { reduced } = useMotion()
  const [spin, setSpin] = useState(false)
  useEffect(() => {
    if (!loading) return setSpin(false)
    const t = setTimeout(() => setSpin(true), SPINNER_DELAY)
    return () => clearTimeout(t)
  }, [loading])

  const fg = variant === 'primary' ? colors.brandFg : variant === 'danger' ? '#FFFFFF' : colors.text
  const bg = variant === 'primary' ? colors.brand : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.surfaceMuted : 'transparent'
  const sm = size === 'sm'
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={done ? 'Saved' : accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading || done, busy: loading }}
      disabled={disabled || loading || done}
      haptic="selection"
      feedback={variant === 'ghost' ? 'opacity' : 'scale'}
      onPress={onPress}
      style={{
        height: sm ? 40 : variant === 'ghost' ? 48 : 52,
        borderRadius: sm ? 12 : 14,
        paddingHorizontal: sm ? 14 : 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {done ? (
        <Animated.View entering={reduced ? FadeIn.duration(duration.fast) : checkIn}>
          <Check size={sm ? 18 : 22} color={fg} strokeWidth={2.6} />
        </Animated.View>
      ) : spin ? (
        <Animated.View entering={FadeIn.duration(duration.fast)}>
          <ActivityIndicator color={fg} />
        </Animated.View>
      ) : typeof children === 'string' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text numberOfLines={1} style={{ color: fg, fontSize: sm ? 14 : 15, fontWeight: '600', letterSpacing: -0.1 }}>
            {children}
          </Text>
        </View>
      ) : (
        children
      )}
    </Press>
  )
}
