import * as Haptics from 'expo-haptics'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'

/** Segmented control (single choice), same look as web: muted track, raised white thumb. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'md' | 'sm'
}) {
  const { colors, scheme } = useTheme()
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', borderRadius: 13, padding: 3, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderSubtle }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              if (on) return
              void Haptics.selectionAsync()
              onChange(o.value)
            }}
            style={{
              height: size === 'sm' ? 32 : 38,
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              ...(on
                ? {
                    backgroundColor: scheme === 'dark' ? '#26272A' : colors.surface,
                    borderWidth: 1,
                    borderColor: scheme === 'dark' ? '#2E2F33' : colors.border,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }
                : null),
            }}
          >
            <Text numberOfLines={1} style={{ color: on ? colors.text : colors.textMuted, fontSize: size === 'sm' ? 12.5 : 13.5, fontWeight: on ? '600' : '500' }}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
