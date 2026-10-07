import type { KeypadKey } from '@hisab/core'
import * as Haptics from 'expo-haptics'
import { Delete } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
]

/** Built-in number pad: no system keyboard, no animation delay (spec §7.3). Long-press ⌫ clears. */
export function Keypad({ onKey }: { onKey: (k: KeypadKey) => void }) {
  const { colors } = useTheme()
  return (
    <View className="gap-1.5">
      {ROWS.map((row, i) => (
        <View key={i} className="flex-row gap-1.5">
          {row.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k}
              onPress={() => {
                void Haptics.selectionAsync()
                onKey(k)
              }}
              onLongPress={k === 'back' ? () => onKey('clear') : undefined}
              className="h-[50px] flex-1 items-center justify-center rounded-[13px]"
              style={({ pressed }) => ({ backgroundColor: pressed ? colors.border : colors.surfaceMuted })}
            >
              {k === 'back' ? (
                <Delete size={22} color={colors.text} strokeWidth={1.8} />
              ) : (
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: '500' }}>{k}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  )
}
