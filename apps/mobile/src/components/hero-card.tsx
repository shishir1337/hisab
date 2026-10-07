import type { Grouping } from '@hisab/core'
import { tokens } from '@hisab/tokens'
import * as Haptics from 'expo-haptics'
import { Eye, EyeOff } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { usePrivacy } from '@/lib/privacy'
import { useTheme } from '@/lib/theme'
import { Money } from './money'
import { Press } from './press'

interface HeroCardProps {
  total: number
  series: number[]
  owedToYou: number
  loansLeft: number
  currency: string
  grouping: Grouping
}

const SPARK_HEIGHT = 36
const PAD = 20

/** Ink hero card (spec §7.3): total balance, 30-day trend, Owed-to-you / Loans-left tiles. Tap to hide amounts. */
export function HeroCard({ total, series, owedToYou, loansLeft, currency, grouping }: HeroCardProps) {
  const { scheme } = useTheme()
  const c = tokens.color[scheme]
  const { hidden, toggle } = usePrivacy()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const EyeIcon = hidden ? EyeOff : Eye

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Total balance hidden. Show amounts' : 'Total balance. Hide amounts'}
      onPress={() => {
        void Haptics.selectionAsync()
        toggle()
      }}
      feedback="none"
      pressedStyle={{ transform: [{ scale: 0.985 }] }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width !== size.width || height !== size.height) setSize({ width, height })
      }}
      style={{
        overflow: 'hidden',
        borderRadius: tokens.radius.hero,
        padding: PAD,
        // Solid fallback so the card is never white before (or without) the gradient.
        backgroundColor: c.heroTo,
        borderWidth: 1,
        borderColor: c.heroBorder,
      }}
    >
      {size.width > 0 && (
        // react-native-svg needs explicit pixel dimensions; percentage sizing fell back to a default height.
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="ink" cx="0%" cy="0%" rx="120%" ry="140%" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={c.heroFrom} />
              <Stop offset="0.62" stopColor={c.heroTo} />
              <Stop offset="1" stopColor={c.heroTo} />
            </RadialGradient>
            <RadialGradient id="glow" cx="100%" cy="0%" rx="45%" ry="65%" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.09} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#ink)" />
          <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#glow)" />
        </Svg>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' }}>Total balance</Text>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: -4 }}>
          <EyeIcon size={16} color="rgba(255,255,255,0.45)" />
        </View>
      </View>
      <View style={{ marginTop: 2 }}>
        <Money minor={total} currency={currency} grouping={grouping} size={34} weight="600" color={c.heroText} />
      </View>

      {/* Same height hidden or not, so toggling never shifts the tiles. */}
      <View style={{ height: SPARK_HEIGHT, marginTop: 12 }}>
        {!hidden && size.width > 0 && series.length > 1 && <Sparkline values={series} width={size.width - PAD * 2} height={SPARK_HEIGHT} />}
      </View>

      <View style={{ marginTop: 16, flexDirection: 'row', gap: 10 }}>
        <Tile label="Owed to you">
          <Money minor={owedToYou} currency={currency} grouping={grouping} size={15} weight="600" color={owedToYou > 0 ? '#4ADE80' : c.heroText} />
        </Tile>
        <Tile label="Loans left">
          <Money minor={loansLeft} currency={currency} grouping={grouping} size={15} weight="600" color={c.heroText} />
        </Tile>
      </View>
    </Press>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{label}</Text>
      <View style={{ marginTop: 2 }}>{children}</View>
    </View>
  )
}

function Sparkline({ values, width, height }: { values: number[]; width: number; height: number }) {
  const min = Math.min(...values)
  const span = Math.max(...values) - min
  const step = width / (values.length - 1)
  // A flat month draws a calm line through the middle rather than along the floor (as on web).
  const pts = values.map((v, i) => [i * step, span ? height - 3 - ((v - min) / span) * (height - 6) : height / 2] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <Svg width={width} height={height}>
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
