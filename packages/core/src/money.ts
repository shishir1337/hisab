export type Grouping = 'south_asian' | 'western'

export type ParseAmountResult =
  | { ok: true; minor: number }
  | { ok: false; error: 'empty' | 'invalid' | 'zero' | 'negative' | 'precision' }

const MINUS = '−'

/** Parses user-typed amounts ("1,450", "1450.5") into minor units (2 decimals). */
export function parseAmount(input: string): ParseAmountResult {
  const s = input.trim().replace(/,/g, '')
  if (s === '') return { ok: false, error: 'empty' }
  if (/^-\d/.test(s)) return { ok: false, error: 'negative' }
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return { ok: false, error: 'invalid' }
  const whole = m[1] || '0'
  const frac = m[2] ?? ''
  if (frac.length > 2) return { ok: false, error: 'precision' }
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'invalid' }
  if (minor === 0) return { ok: false, error: 'zero' }
  return { ok: true, minor }
}

/** Groups an integer string: south_asian → 12,34,567; western → 1,234,567. */
export function groupDigits(digits: string, grouping: Grouping): string {
  if (digits.length <= 3) return digits
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3)
  const size = grouping === 'south_asian' ? 2 : 3
  const parts: string[] = []
  for (let i = rest.length; i > 0; i -= size) parts.unshift(rest.slice(Math.max(0, i - size), i))
  return `${parts.join(',')},${last3}`
}

export interface FormatMoneyOptions {
  grouping?: Grouping
  /** auto: show decimals only when non-zero. */
  showDecimals?: 'always' | 'never' | 'auto'
  sign?: 'auto' | 'always' | 'never'
}

export interface FormattedMoney {
  /** ISO code, rendered smaller/lighter than the number. */
  code: string
  number: string
  text: string
}

export function formatMoney(
  minor: number,
  currency: string,
  opts: FormatMoneyOptions = {},
): FormattedMoney {
  const { grouping = 'south_asian', showDecimals = 'auto', sign = 'auto' } = opts
  const negative = minor < 0
  let abs = Math.abs(Math.trunc(minor))
  if (showDecimals === 'never') abs = Math.round(abs / 100) * 100
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  let number = groupDigits(String(whole), grouping)
  if (showDecimals === 'always' || (showDecimals === 'auto' && frac !== 0)) {
    number += '.' + String(frac).padStart(2, '0')
  }
  if (sign !== 'never') {
    if (negative) number = MINUS + number
    else if (sign === 'always' && abs !== 0) number = '+' + number
  }
  const code = currency.toUpperCase()
  return { code, number, text: `${code} ${number}` }
}

function trimDecimal(n: number): string {
  const s = (Math.floor(n * 10) / 10).toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** Compact form for tiles: 4.2L, 1.2Cr (south_asian) or 420K, 1.2M (western). */
export function formatCompact(minor: number, grouping: Grouping): string {
  const negative = minor < 0
  const units = Math.abs(minor) / 100
  const steps: Array<[number, string]> =
    grouping === 'south_asian'
      ? [
          [1e7, 'Cr'],
          [1e5, 'L'],
        ]
      : [
          [1e9, 'B'],
          [1e6, 'M'],
          [1e3, 'K'],
        ]
  let out: string | undefined
  for (const [size, suffix] of steps) {
    if (units >= size) {
      out = trimDecimal(units / size) + suffix
      break
    }
  }
  out ??= groupDigits(String(Math.round(units)), grouping)
  return negative ? MINUS + out : out
}

/** originalMinor × rate, rounded half-to-even, using exact decimal math. */
export function convertFx(originalMinor: number, rate: string): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim())
  if (!m) throw new Error(`Invalid fx rate: ${rate}`)
  const frac = m[2] ?? ''
  const scale = 10n ** BigInt(frac.length)
  const product = BigInt(originalMinor) * BigInt(m[1]! + frac)
  let q = product / scale
  const r = product % scale
  const twice = r * 2n
  if (twice > scale || (twice === scale && q % 2n === 1n)) q += 1n
  return Number(q)
}
