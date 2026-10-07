import type { Grouping } from '@hisab/core'
import { tokens } from '@hisab/tokens'
import { useState } from 'react'
import { usePrivacy } from '@/lib/privacy'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '@/lib/theme'
import { Money } from './money'

interface HeroCardProps {
  total: number
  series: number[]
  owedToYou: number
  loansLeft: number
  currency: string
  grouping: Grouping
}

/** Ink hero card (spec §7.3): total balance, 30-day trend, Owed-to-you / Loans-left tiles. Tap to hide amounts. */
export function HeroCard({ total, series, owedToYou, loansLeft, currency, grouping }: HeroCardProps) {
  const { scheme } = useTheme()
  const c = tokens.color[scheme]
  const { hidden, toggle } = usePrivacy()
  const [width, setWidth] = useState(0)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
      onPress={toggle}
      className="overflow-hidden rounded-hero p-5"
      style={{ borderWidth: 1, borderColor: c.heroBorder }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="ink" cx="0%" cy="0%" rx="120%" ry="140%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={c.heroFrom} />
            <Stop offset="0.62" stopColor={c.heroTo} />
            <Stop offset="1" stopColor={c.heroTo} />
          </RadialGradient>
          <RadialGradient id="glow" cx="100%" cy="0%" rx="40%" ry="60%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ink)" />
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>

      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Total balance</Text>
      {hidden ? (
        <Text style={{ color: c.heroText, fontSize: 32, fontWeight: '600', letterSpacing: 2 }}>••••••</Text>
      ) : (
        <Money minor={total} currency={currency} grouping={grouping} size={32} color={c.heroText} showDecimals="always" />
      )}

      {width > 0 && series.length > 1 && <Sparkline values={series} width={width - 40} />}

      <View className="mt-4 flex-row gap-2">
        {(
          [
            ['Owed to you', owedToYou, '#4ADE80'],
            ['Loans left', loansLeft, c.heroText],
          ] as const
        ).map(([label, value, color]) => (
          <View
            key={label}
            className="flex-1 rounded-chip px-3 py-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5 }}>{label}</Text>
            {hidden ? (
              <Text style={{ color: c.heroText, fontSize: 13, fontWeight: '600' }}>••••</Text>
            ) : (
              <Money minor={value} currency={currency} grouping={grouping} size={13} color={value > 0 ? color : c.heroText} />
            )}
          </View>
        ))}
      </View>
    </Pressable>
  )
}

function Sparkline({ values, width, height = 30 }: { values: number[]; width: number; height?: number }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const pts = values.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <Svg width={width} height={height} style={{ marginTop: 6 }}>
      <Defs>
        <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.18} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${line} L${width} ${height} L0 ${height} Z`} fill="url(#fill)" />
      <Path d={line} stroke="#FFFFFF" strokeOpacity={0.8} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
