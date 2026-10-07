import { formatMoney, type FormatMoneyOptions } from '@hisab/core'
import { cn } from '@/lib/utils'

interface MoneyProps extends FormatMoneyOptions {
  minor: number
  currency: string
  /** Hide the ISO code (e.g. inside dense lists where the column header carries it). */
  hideCode?: boolean
  className?: string
}

/** Renders an amount as `BDT 2,48,350` with the code smaller and lighter than the number. */
export function Money({ minor, currency, hideCode, className, ...opts }: MoneyProps) {
  const f = formatMoney(minor, currency, opts)
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
