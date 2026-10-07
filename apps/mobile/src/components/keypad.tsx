import type { KeypadKey } from '@hisab/core'
import * as Haptics from 'expo-haptics'
import { Delete } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

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
    <View style={{ gap: 6 }}>
      {ROWS.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
          {row.map((k) => (
            <Press
              key={k}
              accessibilityRole="button"
              accessibilityLabel={k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k}
              accessibilityHint={k === 'back' ? 'Long-press to clear' : undefined}
              onPress={() => {
                void Haptics.selectionAsync()
                onKey(k)
              }}
              onLongPress={
                k === 'back'
                  ? () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                      onKey('clear')
                    }
                  : undefined
              }
              feedback="none"
              pressedStyle={{ backgroundColor: colors.border, transform: [{ scale: 0.98 }] }}
              style={{ height: 52, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surfaceMuted }}
            >
              {k === 'back' ? (
                <Delete size={22} color={colors.text} strokeWidth={1.8} />
              ) : (
                <Text style={{ color: colors.text, fontSize: 23, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{k}</Text>
              )}
            </Press>
          ))}
        </View>
      ))}
    </View>
  )
}
