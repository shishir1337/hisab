import { formatMoney, type FormatMoneyOptions } from '@hisab/core'
import { useCountUp } from '@/lib/motion'
import { usePrivacy } from '@/lib/privacy'
import { cn } from '@/lib/utils'

interface MoneyProps extends FormatMoneyOptions {
  minor: number
  currency: string
  /** Hide the ISO code (e.g. inside dense lists where the column header carries it). */
  hideCode?: boolean
  /** Show even when "hide amounts" is on. */
  reveal?: boolean
  /** Count to a new value (~400 ms) when it changes, for headline totals. */
  animate?: boolean
  className?: string
}

/** Renders an amount as `BDT 2,48,350` with the code smaller and lighter than the number. */
export function Money({ minor, currency, hideCode, className, reveal, animate, ...opts }: MoneyProps) {
  const { hidden } = usePrivacy()
  const masked = hidden && !reveal
  const counted = useCountUp(minor, Boolean(animate) && !masked)
  const f = formatMoney(animate ? counted : minor, currency, opts)
  if (masked)
    return (
      <span className={cn('money num whitespace-nowrap', className)} aria-label="Amount hidden">
        {!hideCode && <span className="currency-code">{f.code}</span>}••••
      </span>
    )
  const [whole, decimals] = f.number.split('.')
  // Spoken form, e.g. "minus 1,450 BDT" (spec §7.5); the visual form is hidden from screen readers.
  // While counting, screen readers get the final value, not every frame.
  const final = animate ? formatMoney(minor, currency, opts) : f
  const spoken = `${final.number.replace('−', 'minus ').replace('+', 'plus ')} ${final.code}`
  return (
    <span className={cn('money num whitespace-nowrap', className)}>
      <span aria-hidden>
        {!hideCode && <span className="currency-code">{f.code}</span>}
        {whole}
        {decimals !== undefined && <span className="opacity-40">.{decimals}</span>}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
