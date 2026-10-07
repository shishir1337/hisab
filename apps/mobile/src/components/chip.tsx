import type { ReactNode } from 'react'
import { Text } from 'react-native'
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

/** Choice chip (same as web): selected = ink fill; unselected = quiet outline on a white surface. */
export function Chip({ label, icon, selected, onPress, onLongPress, accessibilityLabel, size = 'md', tone = 'outline' }: ChipProps) {
  const { colors } = useTheme()
  const sm = size === 'sm'
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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: sm ? 11 : 14,
        height: sm ? 32 : 36,
        backgroundColor: selected ? colors.brand : tone === 'muted' ? colors.surfaceMuted : colors.surface,
        borderColor: selected ? colors.brand : tone === 'muted' ? colors.surfaceMuted : colors.border,
      }}
    >
      {typeof icon === 'function' ? icon(selected ? colors.brandFg : colors.textMuted) : icon}
      <Text
        numberOfLines={1}
        style={{ color: selected ? colors.brandFg : colors.text, fontSize: sm ? 12.5 : 13.5, fontWeight: selected ? '600' : '500', maxWidth: 220 }}
      >
        {label}
      </Text>
    </Press>
  )
}
