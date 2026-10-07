import type { Tabs } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Home, ListOrdered, Plus, Target, Users, type LucideIcon } from 'lucide-react-native'
import type { ComponentProps } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuickLog } from '@/features/quick-log/provider'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: Home, label: 'Home' },
  activity: { icon: ListOrdered, label: 'Activity' },
  plan: { icon: Target, label: 'Plan' },
  people: { icon: Users, label: 'People' },
}

/** Height of the tab row above the system navigation inset. */
export const TAB_BAR_HEIGHT = 64

/** Four tabs plus the floating + that opens quick log. Spec §7.2. */
export function TabBar({ state, navigation }: TabBarProps) {
  const { colors, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  const quickLog = useQuickLog()

  return (
    <View pointerEvents="box-none">
      <Press
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        haptic="light"
        feedback="scale"
        onPress={() => quickLog.open()}
        style={{
          position: 'absolute',
          right: 18,
          bottom: TAB_BAR_HEIGHT + insets.bottom + 16,
          width: 58,
          height: 58,
          borderRadius: 29,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.brand,
          shadowColor: '#000',
          shadowOpacity: scheme === 'dark' ? 0.5 : 0.22,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Plus color={colors.brandFg} size={26} strokeWidth={2.2} />
      </Press>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.page,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          height: TAB_BAR_HEIGHT + insets.bottom,
        }}
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
              android_ripple={{ color: colors.border, borderless: true, radius: 40 }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!focused && !event.defaultPrevented) {
                  void Haptics.selectionAsync()
                  navigation.navigate(route.name, route.params)
                }
              }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              {/* Pill behind the active icon: Android's native tab language, in ink instead of a hue. */}
              <View style={{ width: 56, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                {/* Mounted only when focused (keyed by theme): changing the background of a live view dropped its radius on Fabric. */}
                {focused && (
                  <View
                    key={scheme}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 15, backgroundColor: scheme === 'dark' ? colors.surfaceMuted : colors.border }}
                  />
                )}
                <Icon color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
              </View>
              <Text style={{ color, fontSize: 11, fontWeight: focused ? '600' : '500', letterSpacing: 0.1 }}>{meta.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
