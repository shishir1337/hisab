import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import { Pressable, Text } from 'react-native'
import { useTheme } from '@/lib/theme'

interface ChipProps {
  label: string
  icon?: ReactNode
  selected?: boolean
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  size?: 'md' | 'sm'
}

export function Chip({ label, icon, selected, onPress, onLongPress, accessibilityLabel, size = 'md' }: ChipProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      onLongPress={onLongPress}
      className="flex-row items-center gap-1.5 rounded-full border"
      style={({ pressed }) => ({
        paddingHorizontal: size === 'sm' ? 10 : 12,
        height: size === 'sm' ? 32 : 38,
        backgroundColor: selected ? colors.brand : colors.surfaceMuted,
        borderColor: selected ? colors.brand : colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon}
      <Text
        numberOfLines={1}
        style={{ color: selected ? colors.brandFg : colors.text, fontSize: size === 'sm' ? 12.5 : 13.5, fontWeight: selected ? '600' : '500' }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
