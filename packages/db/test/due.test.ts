import { describe, expect, it } from 'vitest'
import { computeDueItems } from '../src/due'
import type { LoanWithPayments, RecurringRuleView } from '../src/plan-queries'

const rule = (o: Partial<RecurringRuleView>): RecurringRuleView =>
  ({ id: 'r1', type: 'income', amount_minor: 100, account_id: 'a', to_account_id: null, category_id: 'c', party_id: null, note: 'Salary', frequency: 'weekly', interval: 1, anchor_date: '2026-01-01', end_date: null, mode: 'confirm', paused_at: null, due_from: null, created_at: '2026-01-01T00:00:00Z', category_name: null, category_icon: null, category_color: null, account_name: null, to_account_name: null, party_name: null, ...o }) as RecurringRuleView
const loan: LoanWithPayments = { id: 'l1', name: 'Home', party_id: null, party_name: null, emi_amount_minor: 100, total_installments: 24, first_due_date: '2026-01-10', installments_paid_before: 0, default_account_id: null, default_account_name: null, note: null, closed_at: null, paid_count: 9, paid_amount: 900 }

describe('computeDueItems', () => {
  it('caps a long-ignored weekly item at 3, includes upcoming EMI, sorted by date', () => {
    const items = computeDueItems({ rules: [rule({})], posted: [], skipped: [], loans: [loan] }, '2026-10-07', 'Asia/Dhaka')
    expect(items.filter((i) => i.kind === 'recurring')).toHaveLength(3)
    expect(items.find((i) => i.kind === 'emi')?.date).toBe('2026-10-10')
    expect(items.map((i) => i.date)).toEqual([...items.map((i) => i.date)].sort())
  })
  it('auto rules never appear', () => expect(computeDueItems({ rules: [rule({ mode: 'auto' })], posted: [], skipped: [], loans: [] }, '2026-10-07', 'UTC')).toEqual([]))
})
