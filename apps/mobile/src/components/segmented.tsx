import * as Haptics from 'expo-haptics'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const { colors, scheme } = useTheme()
  return (
    <View accessibilityRole="tablist" className="flex-row rounded-[12px] bg-surface-muted p-[3px]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return
              void Haptics.selectionAsync()
              onChange(o.value)
            }}
            className="h-9 flex-1 items-center justify-center rounded-[10px]"
            style={
              on
                ? {
                    backgroundColor: scheme === 'dark' ? colors.border : colors.surface,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }
                : undefined
            }
          >
            <Text style={{ color: on ? colors.text : colors.textMuted, fontSize: 13, fontWeight: on ? '600' : '500' }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
