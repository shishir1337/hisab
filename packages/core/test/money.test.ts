import { describe, it, expect } from 'vitest'
import { parseAmount, formatMoney, formatCompact, convertFx } from '../src/money'

describe('parseAmount', () => {
  it.each([
    ['1450', 145000],
    ['1,450', 145000],
    ['1450.5', 145050],
    ['0.75', 75],
    [' 12 ', 1200],
    ['2,48,350.00', 24835000],
  ])('%s', (i, m) => expect(parseAmount(i)).toEqual({ ok: true, minor: m }))
  it.each([
    ['', 'empty'],
    ['abc', 'invalid'],
    ['0', 'zero'],
    ['-5', 'negative'],
    ['1.234', 'precision'],
    ['1..2', 'invalid'],
    ['.', 'invalid'],
  ])('%s → %s', (i, e) => expect(parseAmount(i)).toEqual({ ok: false, error: e }))
})

describe('formatMoney', () => {
  it('south asian grouping', () => expect(formatMoney(24835000, 'BDT').text).toBe('BDT 2,48,350'))
  it('western grouping', () =>
    expect(formatMoney(24835000, 'BDT', { grouping: 'western' }).text).toBe('BDT 248,350'))
  it('crore', () => expect(formatMoney(1234567800, 'BDT').number).toBe('1,23,45,678'))
  it('small numbers', () => expect(formatMoney(99900, 'BDT').number).toBe('999'))
  it('auto decimals', () => expect(formatMoney(125050, 'USD').number).toBe('1,250.50'))
  it('always decimals', () =>
    expect(formatMoney(100, 'BDT', { showDecimals: 'always' }).number).toBe('1.00'))
  it('never decimals rounds', () =>
    expect(formatMoney(125050, 'BDT', { showDecimals: 'never' }).number).toBe('1,251'))
  it('negative sign uses minus', () => expect(formatMoney(-3000, 'BDT').text).toBe('BDT −30'))
  it('always sign', () => expect(formatMoney(3000, 'BDT', { sign: 'always' }).number).toBe('+30'))
  it('never sign', () => expect(formatMoney(-3000, 'BDT', { sign: 'never' }).number).toBe('30'))
  it('exposes code', () => expect(formatMoney(1, 'usd').code).toBe('USD'))
})

describe('formatCompact', () => {
  it.each([
    [42000000, 'south_asian', '4.2L'],
    [1200000000, 'south_asian', '1.2Cr'],
    [10000000, 'south_asian', '1L'],
    [42000000, 'western', '420K'],
    [120000000, 'western', '1.2M'],
    [3500000, 'south_asian', '35,000'],
    [99900, 'western', '999'],
    [-42000000, 'south_asian', '−4.2L'],
  ])('%d %s', (m, g, out) =>
    expect(formatCompact(m, g as 'south_asian' | 'western')).toBe(out))
})

describe('convertFx', () => {
  it('converts', () => expect(convertFx(50000, '121.4')).toBe(6070000))
  it('half-even down', () => expect(convertFx(1, '0.5')).toBe(0))
  it('half-even up', () => expect(convertFx(3, '0.5')).toBe(2))
  it('many decimals', () => expect(convertFx(10000, '121.4567')).toBe(1214567))
  it('rejects bad rate', () => expect(() => convertFx(100, 'abc')).toThrow())
})

describe('review fixes', () => {
  it('never shows a negative zero', () =>
    expect(formatMoney(-49, 'BDT', { showDecimals: 'never' }).text).toBe('BDT 0'))
  it('compact rounds instead of truncating', () => {
    expect(formatCompact(199999999, 'south_asian')).toBe('20L')
    expect(formatCompact(1999999999, 'south_asian')).toBe('2Cr')
    expect(formatCompact(19400000, 'south_asian')).toBe('1.9L')
    expect(formatCompact(99999950, 'western')).toBe('1M')
  })
  it('convertFx rejects results beyond safe integers', () =>
    expect(() => convertFx(Number.MAX_SAFE_INTEGER, '2')).toThrow())
})
