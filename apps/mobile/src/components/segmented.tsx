import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { haptic, spring, useMotion } from '@/lib/motion'
import { useTheme } from '@/lib/theme'

const PAD = 3

/** Segmented control (single choice), same look as web: muted track, raised white thumb that slides to the choice. */
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
  const { reduced } = useMotion()
  const [width, setWidth] = useState(0)
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const seg = width > 0 ? width / options.length : 0
  const x = useSharedValue(0)
  const placed = useSharedValue(false)

  useEffect(() => {
    if (!seg) return
    if (!placed.value || reduced) {
      x.value = index * seg
      placed.value = true
    } else x.value = withSpring(index * seg, spring.snappy)
  }, [index, seg, reduced, x, placed])

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const height = size === 'sm' ? 32 : 38

  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', borderRadius: 13, padding: PAD, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderSubtle }}
    >
      <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {seg > 0 && (
          <Animated.View
            // Keyed by theme: changing the background of a live view dropped its radius on Fabric.
            key={scheme}
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: seg,
                height,
                borderRadius: 10,
                backgroundColor: scheme === 'dark' ? '#26272A' : colors.surface,
                borderWidth: 1,
                borderColor: scheme === 'dark' ? '#2E2F33' : colors.border,
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              },
              thumb,
            ]}
          />
        )}
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
                haptic.selection()
                onChange(o.value)
              }}
              style={{ height, flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text numberOfLines={1} style={{ color: on ? colors.text : colors.textMuted, fontSize: size === 'sm' ? 12.5 : 13.5, fontWeight: on ? '600' : '500' }}>
                {o.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
