import { tokens } from '@hisab/tokens'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '@/lib/theme'
import { Money } from './money'

/** Ink hero card (spec §7.3): radial ink gradient, total balance, Owed-to-you and Loans-left tiles. */
export function HeroCard() {
  const { scheme } = useTheme()
  const c = tokens.color[scheme]
  return (
    <View
      accessibilityLabel="Balance"
      className="overflow-hidden rounded-hero p-5"
      style={{ borderWidth: 1, borderColor: c.heroBorder }}
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
      <Money minor={0} currency="BDT" size={32} color={c.heroText} showDecimals="always" />

      <View className="mt-5 flex-row gap-2">
        {(['Owed to you', 'Loans left'] as const).map((label) => (
          <View
            key={label}
            className="flex-1 rounded-chip px-3 py-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5 }}>{label}</Text>
            <Money minor={0} currency="BDT" size={13} color={c.heroText} />
          </View>
        ))}
      </View>
    </View>
  )
}
