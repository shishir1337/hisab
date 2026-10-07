import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'

/** Tab screen scaffold: large title, optional header accessory, scrollable body above the tab bar. */
export function Screen({ title, accessory, children }: { title: string; accessory?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-4 flex-row items-center justify-between">
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }}>
          {title}
        </Text>
        {accessory}
      </View>
      {children}
    </ScrollView>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  const { colors } = useTheme()
  return (
    <View className="items-center rounded-card border border-dashed border-border px-6 py-12">
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 4, textAlign: 'center' }}>{description}</Text>
    </View>
  )
}
