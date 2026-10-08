import { formatMoney, type Grouping } from '@hisab/core'
import { tokens } from '@hisab/tokens'
import { Text, View } from 'react-native'
import Animated, { FadeOut, LinearTransition, withSpring, withTiming, type EntryAnimationsValues } from 'react-native-reanimated'
import { duration, easing, spring, useMotion } from '@/lib/motion'

const { scale: codeScale, weight: codeWeight, opacity: codeOpacity } = tokens.font.currencyCode

/** What the keypad shows: exactly what was typed (a trailing "." or "5" after it included), grouped. */
export function keypadDisplay(keypad: string, currency: string, grouping: Grouping): { whole: string; decimals: string | null } {
  const [w = '', d] = keypad.split('.')
  const whole = formatMoney(Number(w || '0') * 100, currency, { grouping, showDecimals: 'never', sign: 'never' }).number
  return { whole, decimals: d === undefined ? null : d }
}

/** A digit arriving rolls up from just below and settles; it reads as "this changed". */
const digitIn = (_v: EntryAnimationsValues) => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.7 }] },
    animations: {
      opacity: withTiming(1, { duration: duration.fast, easing: easing.out }),
      transform: [{ translateY: withSpring(0, spring.snappy) }, { scale: withSpring(1, spring.snappy) }],
    },
  }
}

/**
 * The quick-log amount: currency code + typed digits. Each glyph is keyed by its position and value, so only
 * glyphs that changed animate in; deleted ones fade down and out, and the rest slide to their new place.
 */
export function KeypadAmount({ keypad, currency, grouping, size = 42, color, faint }: { keypad: string; currency: string; grouping: Grouping; size?: number; color: string; faint: string }) {
  const { reduced } = useMotion()
  const empty = keypad === '' || keypad === '0'
  const { whole, decimals } = keypadDisplay(keypad, currency, grouping)
  const glyphs = [...whole].map((c) => ({ c, dim: false }))
  if (decimals !== null) for (const c of '.' + decimals) glyphs.push({ c, dim: true })
  const label = `${whole}${decimals !== null ? '.' + decimals : ''} ${currency}`
  const textStyle = { fontSize: size, fontWeight: '700' as const, color: empty ? faint : color, fontVariant: ['tabular-nums' as const], letterSpacing: size * tokens.font.numberTracking }
  return (
    <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * codeScale, fontWeight: codeWeight, opacity: codeOpacity, color: empty ? faint : color, letterSpacing: 0.3, marginRight: size * 0.18 }}>{currency}</Text>
      {glyphs.map((g, i) => (
        <Animated.Text
          key={`${i}:${g.c}`}
          entering={reduced || empty ? undefined : digitIn}
          exiting={reduced ? undefined : FadeOut.duration(duration.fast)}
          layout={reduced ? undefined : LinearTransition.springify().damping(spring.snappy.damping).stiffness(spring.snappy.stiffness)}
          style={[textStyle, g.dim ? { opacity: 0.38 } : null]}
        >
          {g.c}
        </Animated.Text>
      ))}
    </View>
  )
}
