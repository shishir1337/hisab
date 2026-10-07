import type { ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
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
  accessibilityLabel?: string
}

export function Button({ children, onPress, variant = 'primary', size = 'md', icon, disabled, loading, accessibilityLabel }: ButtonProps) {
  const { colors } = useTheme()
  const fg = variant === 'primary' ? colors.brandFg : variant === 'danger' ? '#FFFFFF' : colors.text
  const bg = variant === 'primary' ? colors.brand : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.surfaceMuted : 'transparent'
  const sm = size === 'sm'
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
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
      {loading ? (
        <ActivityIndicator color={fg} />
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
