import { beforeEach, describe, expect, it } from 'vitest'
import { ensureDefaultCategories, defaultCategoryId } from '../src/defaults'
import { createAccount } from '../src/mutations'
import {
  closeLoan,
  createLoan,
  createRecurringRule,
  markEmiPaid,
  pauseRecurringRule,
  postDueAutoRules,
  postOccurrence,
  removeBudget,
  setBudget,
  skipOccurrence,
} from '../src/plan-mutations'
import { QP, type BudgetWithSpent, type LoanWithPayments, type RecurringRuleView } from '../src/plan-queries'
import { createTestDb } from './sqlite'

const USER = '0192f5a0-0000-7000-8000-0000000000aa'
const FOOD = defaultCategoryId(USER, 'expense', 'Food')
const RENT = defaultCategoryId(USER, 'expense', 'Rent')
const SALARY = defaultCategoryId(USER, 'income', 'Salary')

let db: ReturnType<typeof createTestDb>
let cash: string
let bank: string

beforeEach(async () => {
  db = createTestDb()
  await ensureDefaultCategories(db, USER)
  cash = await createAccount(db, USER, { name: 'Cash', type: 'cash' })
  bank = await createAccount(db, USER, { name: 'Bank', type: 'bank' })
})

const tx = () => db.getAll<{ type: string; amount_minor: number; recurring_rule_id: string | null; occurrence_date: string | null; loan_id: string | null; installment_number: number | null }>('select * from transactions where deleted_at is null order by occurred_on')

describe('recurring rules', () => {
  const salary = () => ({
    type: 'income' as const,
    amount_minor: 8000000,
    account_id: bank,
    category_id: SALARY,
    frequency: 'monthly' as const,
    interval: 1,
    anchor_date: '2026-10-01',
    mode: 'confirm' as const,
  })

  it('rejects an expense rule without category and a transfer to the same account', async () => {
    await expect(createRecurringRule(db, USER, { ...salary(), category_id: null })).rejects.toThrow()
    await expect(createRecurringRule(db, USER, { ...salary(), type: 'transfer', category_id: null, to_account_id: bank })).rejects.toThrow()
  })

  it('posting an occurrence creates one linked transaction; posting again is a no-op', async () => {
    const id = await createRecurringRule(db, USER, salary())
    const rule = (await db.getAll<RecurringRuleView>(QP.recurringRules))[0]!
    expect(rule).toMatchObject({ id, category_name: 'Salary', account_name: 'Bank' })
    await postOccurrence(db, USER, rule, '2026-10-01')
    await postOccurrence(db, USER, rule, '2026-10-01')
    expect(await tx()).toEqual([expect.objectContaining({ type: 'income', amount_minor: 8000000, recurring_rule_id: id, occurrence_date: '2026-10-01' })])
  })

  it('posting with an edited amount (salary differed this month)', async () => {
    await createRecurringRule(db, USER, salary())
    const rule = (await db.getAll<RecurringRuleView>(QP.recurringRules))[0]!
    await postOccurrence(db, USER, rule, '2026-10-01', { amount_minor: 8200000 })
    expect((await tx())[0]!.amount_minor).toBe(8200000)
  })

  it('posted and skipped occurrences are reported for due calculation', async () => {
    const id = await createRecurringRule(db, USER, salary())
    const rule = (await db.getAll<RecurringRuleView>(QP.recurringRules))[0]!
    await postOccurrence(db, USER, rule, '2026-10-01')
    await skipOccurrence(db, USER, id, '2026-11-01')
    expect(await db.getAll(QP.postedOccurrences)).toEqual([{ rule_id: id, occurrence_date: '2026-10-01' }])
    expect(await db.getAll(QP.skippedOccurrences)).toEqual([{ rule_id: id, occurrence_date: '2026-11-01' }])
  })

  it('auto rules post everything due (once), confirm and paused rules are left alone', async () => {
    await createRecurringRule(db, USER, { ...salary(), mode: 'confirm' })
    await createRecurringRule(db, USER, {
      type: 'expense',
      amount_minor: 2500000,
      account_id: bank,
      category_id: RENT,
      frequency: 'monthly',
      interval: 1,
      anchor_date: '2026-09-05',
      mode: 'auto',
      created_on: '2026-09-01',
    })
    const paused = await createRecurringRule(db, USER, { ...salary(), category_id: SALARY, mode: 'auto', anchor_date: '2026-09-01', created_on: '2026-09-01' })
    await pauseRecurringRule(db, paused, true)

    expect(await postDueAutoRules(db, USER, '2026-10-07')).toBe(2)
    expect(await postDueAutoRules(db, USER, '2026-10-07')).toBe(0)
    expect((await tx()).map((t) => [t.type, t.occurrence_date])).toEqual([
      ['expense', '2026-09-05'],
      ['expense', '2026-10-05'],
    ])
  })
})

describe('loans', () => {
  const homeLoan = () => ({
    name: 'Home loan',
    emi_amount_minor: 1500000,
    total_installments: 24,
    first_due_date: '2026-01-10',
    installments_paid_before: 6,
    default_account_id: bank,
  })

  it('mark paid creates the next installment; payments are summarized', async () => {
    const id = await createLoan(db, USER, homeLoan())
    await markEmiPaid(db, USER, id, { occurred_on: '2026-07-10' })
    await markEmiPaid(db, USER, id, { occurred_on: '2026-08-10', amount_minor: 1600000 })
    expect((await tx()).map((t) => [t.type, t.installment_number, t.amount_minor])).toEqual([
      ['emi', 7, 1500000],
      ['emi', 8, 1600000],
    ])
    const loan = (await db.getAll<LoanWithPayments>(QP.loansWithPayments))[0]!
    expect(loan).toMatchObject({ id, paid_count: 2, paid_amount: 3100000, default_account_name: 'Bank' })
  })

  it('cannot pay beyond the last installment', async () => {
    const id = await createLoan(db, USER, { ...homeLoan(), total_installments: 7 })
    await markEmiPaid(db, USER, id, { occurred_on: '2026-07-10' })
    await expect(markEmiPaid(db, USER, id, { occurred_on: '2026-08-10' })).rejects.toThrow(/fully paid/i)
  })

  it('needs an account (loan default or explicit)', async () => {
    const id = await createLoan(db, USER, { ...homeLoan(), default_account_id: null })
    await expect(markEmiPaid(db, USER, id, { occurred_on: '2026-07-10' })).rejects.toThrow(/account/i)
    await markEmiPaid(db, USER, id, { occurred_on: '2026-07-10', account_id: cash })
    expect(await tx()).toHaveLength(1)
  })

  it('closed loans drop out of the active list', async () => {
    const id = await createLoan(db, USER, homeLoan())
    await closeLoan(db, id, true)
    expect(await db.getAll(QP.loansWithPayments)).toEqual([])
  })
})

describe('budgets', () => {
  it('set (upsert per category), spent this month, remove', async () => {
    await setBudget(db, USER, null, 3000000)
    await setBudget(db, USER, FOOD, 1000000)
    await setBudget(db, USER, FOOD, 1200000)
    await db.execute(
      `insert into transactions (id, user_id, type, amount_minor, account_id, category_id, occurred_on, occurred_at) values
       ('t1', ?, 'expense', 7800, ?, ?, '2026-10-03', '2026-10-03T05:00:00Z'),
       ('t2', ?, 'expense', 500, ?, ?, '2026-09-30', '2026-09-30T05:00:00Z')`,
      [USER, cash, FOOD, USER, cash, FOOD],
    )
    const rows = await db.getAll<BudgetWithSpent>(QP.budgetsWithSpent, ['2026-10-01', '2026-10-31'])
    expect(rows.map((b) => [b.category_name ?? 'Overall', b.amount_minor, b.spent])).toEqual([
      ['Overall', 3000000, 7800],
      ['Food', 1200000, 7800],
    ])
    await removeBudget(db, FOOD)
    expect(await db.getAll(QP.budgetsWithSpent, ['2026-10-01', '2026-10-31'])).toHaveLength(1)
  })
})

import { restoreTransaction, softDeleteTransaction, updateTransaction } from '../src/mutations'
import { updateRecurringRule } from '../src/plan-mutations'

describe('m3 review fixes', () => {
  const rent = () => ({
    type: 'expense' as const,
    amount_minor: 2500000,
    account_id: bank,
    category_id: RENT,
    frequency: 'monthly' as const,
    interval: 1,
    anchor_date: '2026-09-05',
    mode: 'auto' as const,
    created_on: '2026-09-01',
  })
  const txRows = () => db.getAll<{ id: string; amount_minor: number; occurrence_date: string | null; recurring_rule_id: string | null }>('select * from transactions where deleted_at is null order by occurrence_date')

  it('editing a posted occurrence keeps its link — the rule does not post it again', async () => {
    await createRecurringRule(db, USER, rent())
    await postDueAutoRules(db, USER, '2026-09-10')
    const [t] = await txRows()
    await updateTransaction(db, t!.id, { type: 'expense', amount_minor: 2600000, account_id: bank, category_id: RENT, occurred_on: '2026-09-05', occurred_at: '2026-09-05T06:00:00.000Z' })
    expect(await postDueAutoRules(db, USER, '2026-09-10')).toBe(0)
    expect((await txRows()).map((r) => [r.amount_minor, r.occurrence_date])).toEqual([[2600000, '2026-09-05']])
  })

  it('deleting an auto-posted occurrence skips it (no re-post); restoring un-skips', async () => {
    await createRecurringRule(db, USER, rent())
    await postDueAutoRules(db, USER, '2026-09-10')
    const [t] = await txRows()
    await softDeleteTransaction(db, t!.id)
    expect(await postDueAutoRules(db, USER, '2026-09-10')).toBe(0)
    await restoreTransaction(db, t!.id)
    expect(await db.getAll(QP.skippedOccurrences)).toEqual([])
    expect(await txRows()).toHaveLength(1)
  })

  it('pause then resume does not back-post the missed months', async () => {
    const id = await createRecurringRule(db, USER, rent())
    await postDueAutoRules(db, USER, '2026-09-10')
    await pauseRecurringRule(db, id, true, '2026-09-20')
    await pauseRecurringRule(db, id, false, '2026-12-01')
    expect(await postDueAutoRules(db, USER, '2026-12-01')).toBe(0)
    expect(await postDueAutoRules(db, USER, '2026-12-05')).toBe(1)
  })

  it('changing the schedule does not backfill past dates', async () => {
    const id = await createRecurringRule(db, USER, rent())
    await postDueAutoRules(db, USER, '2026-09-10')
    await updateRecurringRule(db, id, { ...rent(), anchor_date: '2026-08-25' }, '2026-09-10')
    expect(await postDueAutoRules(db, USER, '2026-09-10')).toBe(0)
    expect(await postDueAutoRules(db, USER, '2026-09-25')).toBe(1)
  })

  it('postOccurrence reports whether it created anything', async () => {
    await createRecurringRule(db, USER, { ...rent(), mode: 'confirm' })
    const rule = (await db.getAll<RecurringRuleView>(QP.recurringRules))[0]!
    expect((await postOccurrence(db, USER, rule, '2026-09-05')).created).toBe(true)
    expect((await postOccurrence(db, USER, rule, '2026-09-05', { amount_minor: 1 })).created).toBe(false)
  })

  it('legacy space-separated created_at still auto-posts', async () => {
    const id = await createRecurringRule(db, USER, rent())
    await db.execute("update recurring_rules set created_at = '2026-09-01 00:00:00Z' where id = ?", [id])
    expect(await postDueAutoRules(db, USER, '2026-09-10', 'Asia/Dhaka')).toBe(1)
  })

  it('EMI numbering fills a gap left by a deleted payment and the loan can still finish', async () => {
    const id = await createLoan(db, USER, { name: 'Bike', emi_amount_minor: 100, total_installments: 6, first_due_date: '2026-01-10', installments_paid_before: 2, default_account_id: cash })
    const e3 = await markEmiPaid(db, USER, id, { occurred_on: '2026-03-10' })
    await markEmiPaid(db, USER, id, { occurred_on: '2026-04-10' })
    await softDeleteTransaction(db, e3)
    await markEmiPaid(db, USER, id, { occurred_on: '2026-04-11' })
    await markEmiPaid(db, USER, id, { occurred_on: '2026-05-10' })
    await markEmiPaid(db, USER, id, { occurred_on: '2026-06-10' })
    const nums = (await db.getAll<{ installment_number: number }>("select installment_number from transactions where type = 'emi' and deleted_at is null order by installment_number")).map((r) => r.installment_number)
    expect(nums).toEqual([3, 4, 5, 6])
    await expect(markEmiPaid(db, USER, id, { occurred_on: '2026-07-10' })).rejects.toThrow(/fully paid/i)
  })

  it('auto rules skip archived accounts instead of posting money that vanishes', async () => {
    await createRecurringRule(db, USER, rent())
    await db.execute('update accounts set archived_at = ? where id = ?', ['2026-09-01T00:00:00Z', bank])
    expect(await postDueAutoRules(db, USER, '2026-09-10')).toBe(0)
  })
})
