import { describe, it, expect } from 'vitest'
import { signedEffect } from '../src/ledger'
import { localDate, groupByDay, dayLabel, monthRange, addDays } from '../src/dates'

const A = 'acc-a'
const B = 'acc-b'

describe('signedEffect', () => {
  it.each([
    ['income', 1000],
    ['lending_in', 1000],
    ['expense', -1000],
    ['emi', -1000],
    ['lending_out', -1000],
  ] as const)('%s on its account → %d', (type, want) =>
    expect(signedEffect({ type, amount_minor: 1000, account_id: A }, A)).toBe(want))

  it('transfer subtracts from source', () =>
    expect(signedEffect({ type: 'transfer', amount_minor: 500, account_id: A, to_account_id: B }, A)).toBe(-500))
  it('transfer adds to target', () =>
    expect(signedEffect({ type: 'transfer', amount_minor: 500, account_id: A, to_account_id: B }, B)).toBe(500))
  it('unrelated account is unaffected', () =>
    expect(signedEffect({ type: 'expense', amount_minor: 500, account_id: A }, B)).toBe(0))
})

describe('localDate', () => {
  it('uses the local calendar day (Dhaka is UTC+6)', () =>
    expect(localDate(new Date('2026-10-06T18:30:00Z'), 'Asia/Dhaka')).toBe('2026-10-07'))
  it('before local midnight stays on the same day', () =>
    expect(localDate(new Date('2026-10-06T17:59:00Z'), 'Asia/Dhaka')).toBe('2026-10-06'))
  it('UTC zone', () => expect(localDate(new Date('2026-01-01T00:00:00Z'), 'UTC')).toBe('2026-01-01'))
})

describe('addDays', () => {
  it('crosses month ends', () => expect(addDays('2026-10-31', 1)).toBe('2026-11-01'))
  it('goes backwards across years', () => expect(addDays('2026-01-01', -1)).toBe('2025-12-31'))
})

describe('groupByDay', () => {
  it('groups newest day first, keeping row order within a day', () => {
    const rows = [
      { id: 1, occurred_on: '2026-10-05' },
      { id: 2, occurred_on: '2026-10-07' },
      { id: 3, occurred_on: '2026-10-05' },
    ]
    expect(groupByDay(rows)).toEqual([
      { day: '2026-10-07', rows: [rows[1]] },
      { day: '2026-10-05', rows: [rows[0], rows[2]] },
    ])
  })
})

describe('dayLabel', () => {
  it('today', () => expect(dayLabel('2026-10-07', '2026-10-07')).toBe('Today'))
  it('yesterday', () => expect(dayLabel('2026-10-06', '2026-10-07')).toBe('Yesterday'))
  it('this year', () => expect(dayLabel('2026-10-05', '2026-10-07')).toBe('Mon, 5 Oct'))
  it('other year', () => expect(dayLabel('2025-12-31', '2026-10-07')).toBe('31 Dec 2025'))
})

describe('monthRange', () => {
  it('october', () => expect(monthRange('2026-10-17')).toEqual({ start: '2026-10-01', end: '2026-10-31' }))
  it('february leap year', () => expect(monthRange('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' }))
})
