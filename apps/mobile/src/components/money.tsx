import { formatMoney, type FormatMoneyOptions } from '@hisab/core'
import { tokens } from '@hisab/tokens'
import { Text, type TextStyle } from 'react-native'
import { usePrivacy } from '@/lib/privacy'

interface MoneyProps extends FormatMoneyOptions {
  minor: number
  currency: string
  size: number
  weight?: TextStyle['fontWeight']
  color?: string
  hideCode?: boolean
  className?: string
  /** Show even when "hide amounts" is on (e.g. inside a form the user is editing). */
  reveal?: boolean
}

const { scale, weight: codeWeight, opacity: codeOpacity } = tokens.font.currencyCode

/** `BDT 2,48,350`: ISO code at 0.62em / 45% opacity, tabular figures (spec §7.1). */
export function Money({ minor, currency, size, weight = '600', color, hideCode, className, reveal, ...opts }: MoneyProps) {
  const { hidden } = usePrivacy()
  const f = formatMoney(minor, currency, opts)
  if (hidden && !reveal) {
    return (
      <Text accessibilityLabel="Amount hidden" className={className} style={{ fontSize: size, fontWeight: weight, color, letterSpacing: 1 }}>
        {hideCode ? '' : `${f.code} `}••••
      </Text>
    )
  }
  const [whole, decimals] = f.number.split('.')
  return (
    <Text
      accessibilityLabel={`${f.number.replace('−', 'minus ').replace('+', 'plus ')} ${f.code}`}
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
