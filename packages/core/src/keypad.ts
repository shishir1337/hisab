/** Calculator-style amount entry for the quick-log keypad. State is the typed string, e.g. "1450.5". */

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back' | 'clear'

const MAX_INTEGER_DIGITS = 10
const MAX_DECIMALS = 2

export function keypadReducer(state: string, key: KeypadKey): string {
  if (key === 'clear') return ''
  if (key === 'back') return state.slice(0, -1)
  const dot = state.indexOf('.')
  if (key === '.') {
    if (dot !== -1) return state
    return state === '' ? '0.' : `${state}.`
  }
  if (dot !== -1) return state.length - dot - 1 >= MAX_DECIMALS ? state : state + key
  if (state === '0') return key // collapse leading zero
  if (state.length >= MAX_INTEGER_DIGITS) return state
  return state + key
}

/** Minor units, or null when nothing (or zero) has been entered. */
export function keypadToMinor(state: string): number | null {
  if (state === '' || state === '.') return null
  const [whole = '0', frac = ''] = state.split('.')
  const minor = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
  return minor > 0 ? minor : null
}

/** Inverse of `keypadToMinor` for editing an existing amount. */
export function keypadFromMinor(minor: number): string {
  const whole = Math.floor(minor / 100)
  const frac = minor % 100
  if (frac === 0) return String(whole)
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`
}
