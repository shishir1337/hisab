import { describe, expect, it } from 'vitest'
import { budgetProgress, dueOccurrences, loanProgress, occurrences, safeToSpendPerDay } from '../src/plan'

describe('occurrences', () => {
  it('monthly on the 1st', () =>
    expect(occurrences({ frequency: 'monthly', interval: 1, anchor_date: '2026-01-01' }, '2026-03-01', '2026-05-31')).toEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]))

  it('monthly on the 31st clamps to month end and returns to the 31st', () =>
    expect(occurrences({ frequency: 'monthly', interval: 1, anchor_date: '2026-01-31' }, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]))

  it('every 2 weeks', () =>
    expect(occurrences({ frequency: 'weekly', interval: 2, anchor_date: '2026-10-01' }, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-01',
      '2026-10-15',
      '2026-10-29',
    ]))

  it('yearly on Feb 29 falls on Feb 28 in non-leap years', () =>
    expect(occurrences({ frequency: 'yearly', interval: 1, anchor_date: '2028-02-29' }, '2028-01-01', '2030-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
    ]))

  it('stops at end_date', () =>
    expect(occurrences({ frequency: 'monthly', interval: 1, anchor_date: '2026-01-10', end_date: '2026-03-09' }, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-10',
      '2026-02-10',
    ]))

  it('nothing before the anchor', () =>
    expect(occurrences({ frequency: 'monthly', interval: 1, anchor_date: '2026-06-01' }, '2026-01-01', '2026-05-31')).toEqual([]))
})

describe('dueOccurrences', () => {
  const rule = { frequency: 'monthly' as const, interval: 1, anchor_date: '2026-01-01', created_on: '2026-09-15', paused: false }

  it('starts at the creation day, not the old anchor (no flood of past items)', () =>
    expect(dueOccurrences(rule, new Set(), new Set(), '2026-10-07')).toEqual([{ date: '2026-10-01', overdue: true }]))

  it('excludes posted and skipped; includes the next 7 days', () =>
    expect(
      dueOccurrences({ ...rule, anchor_date: '2026-01-10', created_on: '2026-08-01' }, new Set(['2026-08-10']), new Set(['2026-09-10']), '2026-10-05'),
    ).toEqual([{ date: '2026-10-10', overdue: false }]))

  it('paused rules have nothing due', () => expect(dueOccurrences({ ...rule, paused: true }, new Set(), new Set(), '2026-10-07')).toEqual([]))

  it('due today is not overdue', () =>
    expect(dueOccurrences({ ...rule, anchor_date: '2026-10-07', created_on: '2026-10-07' }, new Set(), new Set(), '2026-10-07')).toEqual([
      { date: '2026-10-07', overdue: false },
    ]))
})

describe('loanProgress', () => {
  const loan = { emi_amount_minor: 1500000, total_installments: 24, first_due_date: '2026-01-10', installments_paid_before: 0 }

  it('fresh loan', () =>
    expect(loanProgress(loan, 0, 0, '2026-01-05')).toMatchObject({
      paid: 0,
      monthsLeft: 24,
      remainingAmount: 36000000,
      nextDueDate: '2026-01-10',
      isOverdue: false,
      debtFreeBy: '2027-12-10',
    }))

  it('9 paid in-app, on time', () =>
    expect(loanProgress(loan, 9, 9 * 1500000, '2026-10-07')).toMatchObject({
      paid: 9,
      monthsLeft: 15,
      paidAmount: 13500000,
      remainingAmount: 22500000,
      nextDueDate: '2026-10-10',
      isOverdue: false,
      debtFreeBy: '2027-12-10',
    }))

  it('counts installments paid before Hisab', () =>
    expect(loanProgress({ ...loan, installments_paid_before: 6 }, 3, 3 * 1500000, '2026-10-07')).toMatchObject({
      paid: 9,
      monthsLeft: 15,
      paidAmount: 13500000,
      nextDueDate: '2026-10-10',
    }))

  it('overdue pushes debt-free date back (spec §6.3)', () =>
    expect(loanProgress(loan, 7, 7 * 1500000, '2026-10-07')).toMatchObject({
      paid: 7,
      monthsLeft: 17,
      nextDueDate: '2026-08-10',
      isOverdue: true,
      debtFreeBy: '2028-02-10',
    }))

  it('finished loan', () =>
    expect(loanProgress(loan, 24, 24 * 1500000, '2027-12-15')).toMatchObject({ monthsLeft: 0, nextDueDate: null, isOverdue: false, debtFreeBy: null }))

  it('due day 31 clamps', () =>
    expect(loanProgress({ ...loan, first_due_date: '2026-01-31' }, 1, 1500000, '2026-02-01').nextDueDate).toBe('2026-02-28'))
})

describe('budgets', () => {
  it.each([
    [5000, 10000, 'ok'],
    [8000, 10000, 'near'],
    [10000, 10000, 'near'],
    [10001, 10000, 'over'],
  ] as const)('spent %d of %d → %s', (spent, limit, state) => expect(budgetProgress(spent, limit).state).toBe(state))

  it('safe to spend per day includes today', () => expect(safeToSpendPerDay(3000000, 2040000, '2026-10-07')).toBe(38400))
  it('last day of month', () => expect(safeToSpendPerDay(3000000, 2900000, '2026-10-31')).toBe(100000))
  it('never negative', () => expect(safeToSpendPerDay(1000, 5000, '2026-10-07')).toBe(0))
})
