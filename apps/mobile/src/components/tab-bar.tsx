import type { Tabs } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Home, ListOrdered, Plus, Target, Users, type LucideIcon } from 'lucide-react-native'
import type { ComponentProps } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: Home, label: 'Home' },
  activity: { icon: ListOrdered, label: 'Activity' },
  plan: { icon: Target, label: 'Plan' },
  people: { icon: Users, label: 'People' },
}

/** Four tabs plus the floating + (quick log arrives in M2). Spec §7.2. */
export function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        className="absolute right-[18px] h-14 w-14 items-center justify-center rounded-full bg-brand"
        style={({ pressed }) => ({
          bottom: 72 + insets.bottom + 14,
          transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        })}
      >
        <Plus color={colors.brandFg} size={26} strokeWidth={2} />
      </Pressable>

      <View
        className="flex-row border-t border-border bg-page"
        style={{ paddingBottom: insets.bottom, height: 64 + insets.bottom }}
      >
        {state.routes.map((route, index) => {
          const meta = ICONS[route.name]
          if (!meta) return null
          const focused = state.index === index
          const Icon = meta.icon
          const color = focused ? colors.text : colors.textFaint
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!focused && !event.defaultPrevented) {
                  void Haptics.selectionAsync()
                  navigation.navigate(route.name, route.params)
                }
              }}
              className="flex-1 items-center justify-center gap-1"
            >
              <Icon color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
              <Text style={{ color, fontSize: 10.5, fontWeight: focused ? '600' : '500' }}>{meta.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
