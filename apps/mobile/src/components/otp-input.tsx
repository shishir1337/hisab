import { useEffect, useState, type Ref } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { duration, easing, haptic, spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'

interface OtpInputProps {
  value: string
  length: number
  onChange: (code: string) => void
  editable: boolean
  invalid: boolean
  /** Bump to shake the row (a wrong code). */
  shakeKey: number
  inputRef?: Ref<TextInput>
}

/**
 * One-time code as separate digit boxes. A single real TextInput sits over the boxes (invisible text and
 * caret), so the keyboard, SMS/email autofill, and long-press → Paste all work natively; a pasted
 * "Your code is 123 456" is cleaned up by the caller's reducer. Each digit pops in; the active box shows a
 * blinking caret; a wrong code shakes the row with a warning haptic.
 */
export function OtpInput({ value, length, onChange, editable, invalid, shakeKey, inputRef }: OtpInputProps) {
  const { reduced } = useMotion()
  const [focused, setFocused] = useState(false)
  const shake = useSharedValue(0)

  useEffect(() => {
    if (!shakeKey) return
    haptic.warning()
    if (reduced) return
    const t = (to: number, ms = 55) => withTiming(to, { duration: ms, easing: easing.inOut })
    shake.value = withSequence(t(-10), t(10), t(-8), t(7), t(-4), t(0, 80))
  }, [shakeKey, reduced, shake])
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

  const active = Math.min(value.length, length - 1)
  const full = value.length >= length
  return (
    <Animated.View style={row}>
      <View style={{ flexDirection: 'row', gap: 8 }} pointerEvents="none">
        {Array.from({ length }, (_, i) => (
          <Box key={i} char={value[i] ?? ''} active={focused && editable && i === active && !full} invalid={invalid} filled={i < value.length} />
        ))}
      </View>
      {/* The real input covers the boxes: tap focuses, long-press offers Paste. Its own text is invisible. */}
      <Pressable style={{ position: 'absolute', inset: 0 }} accessible={false}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={`${length}-digit code`}
          accessibilityHint="Paste works too"
          autoFocus
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          importantForAutofill="yes"
          value={value}
          editable={editable}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          caretHidden
          contextMenuHidden={false}
          selectionColor="transparent"
          cursorColor="transparent"
          underlineColorAndroid="transparent"
          style={{ position: 'absolute', inset: 0, opacity: 0.011, color: 'transparent', backgroundColor: 'transparent', fontSize: 1 }}
        />
      </Pressable>
    </Animated.View>
  )
}

function Box({ char, active, invalid, filled }: { char: string; active: boolean; invalid: boolean; filled: boolean }) {
  const { colors } = useTheme()
  const { reduced } = useMotion()
  const pop = useSharedValue(1)
  const caret = useSharedValue(0)
  const ring = useSharedValue(active ? 1 : 0)

  useEffect(() => {
    if (!char || reduced) return
    pop.value = withSequence(withTiming(1.12, { duration: 70, easing: easing.out }), withSpring(1, spring.bouncy))
  }, [char, reduced, pop])

  useEffect(() => {
    ring.value = withTiming(active ? 1 : 0, { duration: duration.fast, easing: easing.out })
    if (!active) {
      cancelAnimation(caret)
      caret.value = 0
      return
    }
    caret.value = 1
    if (reduced) return
    caret.value = withDelay(500, withRepeat(withSequence(withTiming(0, { duration: 120 }), withDelay(380, withTiming(1, { duration: 120 })), withDelay(380, withTiming(1, { duration: 0 }))), -1, false))
    return () => cancelAnimation(caret)
  }, [active, reduced, caret, ring])

  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value }))
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }))

  const border = invalid ? colors.danger : filled ? colors.textFaint : colors.border
  return (
    <Animated.View
      style={[
        {
          flex: 1,
          height: 60,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        boxStyle,
      ]}
    >
      <Animated.View style={[{ position: 'absolute', inset: -1, borderRadius: 14, borderWidth: 1.5, borderColor: invalid ? colors.danger : colors.text }, ringStyle]} />
      {char ? (
        <Text style={{ color: colors.text, fontSize: 25, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{char}</Text>
      ) : (
        <Animated.View style={[{ width: 2, height: 26, borderRadius: 1, backgroundColor: colors.text }, caretStyle]} />
      )}
    </Animated.View>
  )
}
