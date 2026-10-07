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
  let abs = Math.abs(Math.trunc(minor))
  if (showDecimals === 'never') abs = Math.round(abs / 100) * 100
  // Computed after rounding so tiny negatives never render as "−0".
  const negative = minor < 0 && abs !== 0
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

const round1 = (n: number) => Math.round(n * 10) / 10
const oneDecimal = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** Compact form for tiles: 4.2L, 1.2Cr (south_asian) or 420K, 1.2M (western). Rounds to 1 decimal. */
export function formatCompact(minor: number, grouping: Grouping): string {
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
  const i = steps.findIndex(([size]) => units >= size)
  if (i !== -1) {
    // Promote when rounding reaches the next unit: 9,99,99,999 → "1Cr", not "100L"; 999,999.5 → "1M".
    const bigger = steps[i - 1]
    const [size, suffix] = bigger && round1(units / bigger[0]) >= 1 ? bigger : steps[i]!
    out = oneDecimal(round1(units / size)) + suffix
  }
  out ??= groupDigits(String(Math.round(units)), grouping)
  return minor < 0 && out !== '0' ? MINUS + out : out
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
  if (q > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Converted amount is too large')
  return Number(q)
}
