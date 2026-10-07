import * as Haptics from 'expo-haptics'
import { useState, type ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

export type PressFeedback = 'opacity' | 'scale' | 'soft' | 'none'

type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode
  className?: string
  style?: StyleProp<ViewStyle>
  /** opacity: rows and text links · scale: buttons and tiles · soft: subtle opacity for big surfaces. */
  feedback?: PressFeedback
  /** Extra style while pressed (e.g. a darker background on keypad keys). */
  pressedStyle?: StyleProp<ViewStyle>
  haptic?: 'selection' | 'light' | false
}

const FEEDBACK: Record<PressFeedback, ViewStyle | null> = {
  opacity: { opacity: 0.6 },
  scale: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  soft: { opacity: 0.85 },
  none: null,
}

/**
 * Pressable with real press feedback that survives NativeWind.
 *
 * css-interop drops a function `style={({ pressed }) => …}` whenever `className` is also set, which silently
 * removed padding, colours and positions from chips, the + button and keypad keys. Tracking the pressed state
 * here and passing a plain style array keeps both working.
 */
export function Press({ feedback = 'opacity', pressedStyle, style, haptic = false, onPressIn, onPressOut, onPress, disabled, ...rest }: PressProps) {
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true)
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        setPressed(false)
        onPressOut?.(e)
      }}
      onPress={(e) => {
        if (haptic === 'selection') void Haptics.selectionAsync()
        else if (haptic === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress?.(e)
      }}
      style={[style, pressed && !disabled ? FEEDBACK[feedback] : null, pressed && !disabled ? pressedStyle : null]}
    />
  )
}
