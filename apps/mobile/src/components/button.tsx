import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text } from 'react-native'
import { useTheme } from '@/lib/theme'

interface ButtonProps {
  children: ReactNode
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  loading?: boolean
  accessibilityLabel?: string
}

export function Button({ children, onPress, variant = 'primary', disabled, loading, accessibilityLabel }: ButtonProps) {
  const { colors } = useTheme()
  const fg = variant === 'primary' ? colors.brandFg : colors.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      className={
        variant === 'primary'
          ? 'h-[52px] items-center justify-center rounded-[14px] bg-brand px-5'
          : variant === 'secondary'
            ? 'h-[52px] items-center justify-center rounded-[14px] bg-surface-muted px-5'
            : 'h-11 items-center justify-center px-3'
      }
      style={({ pressed }) => ({
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed && variant !== 'ghost' ? 0.98 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : typeof children === 'string' ? (
        <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  )
}
