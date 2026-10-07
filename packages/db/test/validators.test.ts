import { describe, it, expect } from 'vitest'
import { transactionInput, accountInput, partyInput } from '../src/validators'

const A = '0192f5a0-0000-7000-8000-000000000001'
const B = '0192f5a0-0000-7000-8000-000000000002'
const C = '0192f5a0-0000-7000-8000-000000000003'
const base = {
  amount_minor: 3000,
  account_id: A,
  occurred_on: '2026-10-07',
  occurred_at: '2026-10-07T10:00:00.000Z',
}

type Parsed = { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }
const paths = (r: Parsed) => (r.success ? [] : r.error!.issues.map((i) => i.path.join('.')))
const tx = (o: Record<string, unknown>) => transactionInput.safeParse({ ...base, ...o })

describe('transactionInput', () => {
  it('valid expense', () => expect(tx({ type: 'expense', category_id: C }).success).toBe(true))
  it('valid transfer', () => expect(tx({ type: 'transfer', to_account_id: B }).success).toBe(true))
  it('valid emi', () =>
    expect(tx({ type: 'emi', loan_id: C, installment_number: 1 }).success).toBe(true))
  it('valid fx income', () =>
    expect(
      tx({
        type: 'income',
        category_id: C,
        original_amount_minor: 50000,
        original_currency: 'USD',
        fx_rate: '121.4',
      }).success,
    ).toBe(true))
  it('zero amount', () =>
    expect(paths(tx({ amount_minor: 0, type: 'expense', category_id: C }))).toContain('amount_minor'))
  it('non-integer amount', () =>
    expect(paths(tx({ amount_minor: 1.5, type: 'expense', category_id: C }))).toContain('amount_minor'))
  it('expense needs category', () => expect(paths(tx({ type: 'expense' }))).toContain('category_id'))
  it('transfer needs target', () => expect(paths(tx({ type: 'transfer' }))).toContain('to_account_id'))
  it('transfer to same account', () =>
    expect(paths(tx({ type: 'transfer', to_account_id: A }))).toContain('to_account_id'))
  it('transfer must not have category', () =>
    expect(paths(tx({ type: 'transfer', to_account_id: B, category_id: C }))).toContain('category_id'))
  it('emi needs loan + installment', () => {
    const p = paths(tx({ type: 'emi' }))
    expect(p).toContain('loan_id')
    expect(p).toContain('installment_number')
  })
  it('lending movement needs lending', () =>
    expect(paths(tx({ type: 'lending_out' }))).toContain('lending_id'))
  it('partial fx', () =>
    expect(paths(tx({ type: 'income', category_id: C, original_amount_minor: 5 }))).toContain(
      'original_currency',
    ))
  it('bad fx rate', () =>
    expect(
      paths(
        tx({
          type: 'income',
          category_id: C,
          original_amount_minor: 5,
          original_currency: 'USD',
          fx_rate: '12,1',
        }),
      ),
    ).toContain('fx_rate'))
  it('recurring pair', () =>
    expect(paths(tx({ type: 'expense', category_id: C, recurring_rule_id: B }))).toContain(
      'occurrence_date',
    ))
  it('note too long', () =>
    expect(paths(tx({ type: 'expense', category_id: C, note: 'x'.repeat(501) }))).toContain('note'))
  it('bad date', () =>
    expect(paths(tx({ type: 'expense', category_id: C, occurred_on: '07/10/2026' }))).toContain(
      'occurred_on',
    ))
})

describe('accountInput', () => {
  it('valid (negative opening for cards)', () =>
    expect(accountInput.safeParse({ name: 'Card', type: 'card', opening_balance_minor: -500 }).success).toBe(true))
  it('blank name', () => expect(paths(accountInput.safeParse({ name: '  ', type: 'cash' }))).toContain('name'))
  it('bad type', () => expect(paths(accountInput.safeParse({ name: 'x', type: 'crypto' }))).toContain('type'))
})

describe('partyInput', () => {
  it('valid with phone', () =>
    expect(partyInput.safeParse({ name: 'Rafiq', kind: 'person', phone: '+8801712345621' }).success).toBe(true))
  it('rejects local phone format', () =>
    expect(paths(partyInput.safeParse({ name: 'Rafiq', phone: '01712345621' }))).toContain('phone'))
})
