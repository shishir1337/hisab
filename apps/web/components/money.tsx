import { formatMoney, type FormatMoneyOptions } from '@hisab/core'
import { usePrivacy } from '@/lib/privacy'
import { cn } from '@/lib/utils'

interface MoneyProps extends FormatMoneyOptions {
  minor: number
  currency: string
  /** Hide the ISO code (e.g. inside dense lists where the column header carries it). */
  hideCode?: boolean
  /** Show even when "hide amounts" is on. */
  reveal?: boolean
  className?: string
}

/** Renders an amount as `BDT 2,48,350` with the code smaller and lighter than the number. */
export function Money({ minor, currency, hideCode, className, reveal, ...opts }: MoneyProps) {
  const { hidden } = usePrivacy()
  const f = formatMoney(minor, currency, opts)
  if (hidden && !reveal)
    return (
      <span className={cn('num whitespace-nowrap', className)} aria-label="Amount hidden">
        {!hideCode && <span className="currency-code">{f.code}</span>}••••
      </span>
    )
  const [whole, decimals] = f.number.split('.')
  // Spoken form, e.g. "minus 1,450 BDT" (spec §7.5); the visual form is hidden from screen readers.
  const spoken = `${f.number.replace('−', 'minus ').replace('+', 'plus ')} ${f.code}`
  return (
    <span className={cn('num whitespace-nowrap', className)}>
      <span aria-hidden>
        {!hideCode && <span className="currency-code">{f.code}</span>}
        {whole}
        {decimals !== undefined && <span className="opacity-40">.{decimals}</span>}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
