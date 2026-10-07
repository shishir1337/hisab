import { formatMoney, type FormatMoneyOptions } from '@hisab/core'
import { tokens } from '@hisab/tokens'
import { Text, type TextStyle } from 'react-native'

interface MoneyProps extends FormatMoneyOptions {
  minor: number
  currency: string
  size: number
  weight?: TextStyle['fontWeight']
  color?: string
  hideCode?: boolean
  className?: string
}

const { scale, weight: codeWeight, opacity: codeOpacity } = tokens.font.currencyCode

/** `BDT 2,48,350`: ISO code at 0.62em / 45% opacity, tabular figures (spec §7.1). */
export function Money({ minor, currency, size, weight = '600', color, hideCode, className, ...opts }: MoneyProps) {
  const f = formatMoney(minor, currency, opts)
  const [whole, decimals] = f.number.split('.')
  return (
    <Text
      accessibilityLabel={f.text}
      className={className}
      style={{
        fontSize: size,
        fontWeight: weight,
        color,
        fontVariant: ['tabular-nums'],
        letterSpacing: size * tokens.font.numberTracking,
      }}
    >
      {!hideCode && (
        <Text style={{ fontSize: size * scale, fontWeight: codeWeight, opacity: codeOpacity, letterSpacing: 0.3 }}>
          {f.code}{' '}
        </Text>
      )}
      {whole}
      {decimals !== undefined && <Text style={{ opacity: 0.38 }}>.{decimals}</Text>}
    </Text>
  )
}
