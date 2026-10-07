import { beforeEach, describe, expect, it } from 'vitest'
import {
  archiveAccount,
  createAccount,
  createParty,
  createTransaction,
  restoreTransaction,
  softDeleteTransaction,
  updateTransaction,
  ValidationError,
} from '../src/mutations'
import { Q, type AccountWithBalance, type TransactionView } from '../src/queries'
import { createTestDb } from './sqlite'

const USER = '0192f5a0-0000-7000-8000-0000000000aa'
const CAT_FOOD = '0192f5a0-0000-7000-8000-0000000000c1'
const CAT_SALARY = '0192f5a0-0000-7000-8000-0000000000c2'
const NOW = '2026-10-07T10:00:00.000Z'

let db: ReturnType<typeof createTestDb>
let cash: string
let bank: string

beforeEach(async () => {
  db = createTestDb()
  await db.execute(`insert into categories (id, user_id, name, kind, sort_order) values (?, ?, 'Food', 'expense', 1), (?, ?, 'Salary', 'income', 1)`, [
    CAT_FOOD,
    USER,
    CAT_SALARY,
    USER,
  ])
  cash = await createAccount(db, USER, { name: 'Cash', type: 'cash', opening_balance_minor: 100000 })
  bank = await createAccount(db, USER, { name: 'Bank', type: 'bank', opening_balance_minor: 500000 })
})

const base = { occurred_on: '2026-10-07', occurred_at: NOW }
const balances = async () =>
  Object.fromEntries((await db.getAll<AccountWithBalance>(Q.accountsWithBalance)).map((a) => [a.name, a.balance_minor]))
const total = async () => (await db.getOptional<{ total: number }>(Q.totalBalance))!.total

describe('balances', () => {
  it('opening balances only', async () => {
    expect(await balances()).toEqual({ Cash: 100000, Bank: 500000 })
    expect(await total()).toBe(600000)
  })

  it('applies every transaction type', async () => {
    await createTransaction(db, USER, { ...base, type: 'expense', amount_minor: 3000, account_id: cash, category_id: CAT_FOOD })
    await createTransaction(db, USER, { ...base, type: 'income', amount_minor: 8000000, account_id: bank, category_id: CAT_SALARY })
    await createTransaction(db, USER, { ...base, type: 'transfer', amount_minor: 50000, account_id: bank, to_account_id: cash })
    expect(await balances()).toEqual({ Cash: 100000 - 3000 + 50000, Bank: 500000 + 8000000 - 50000 })
    expect(await total()).toBe(600000 - 3000 + 8000000)
  })

  it('archived accounts keep their balance but leave the total', async () => {
    await archiveAccount(db, bank, true)
    const rows = await db.getAll<AccountWithBalance>(Q.accountsWithBalance)
    expect(rows.find((a) => a.id === bank)).toMatchObject({ archived: 1, balance_minor: 500000 })
    expect(await total()).toBe(100000)
    expect((await db.getAll<{ id: string }>(Q.activeAccounts)).map((a) => a.id)).toEqual([cash])
  })
})

describe('transactions', () => {
  it('soft delete hides, restore brings back', async () => {
    const id = await createTransaction(db, USER, { ...base, type: 'expense', amount_minor: 3000, account_id: cash, category_id: CAT_FOOD })
    await softDeleteTransaction(db, id)
    expect(await db.getAll(Q.transactionsBetween, ['2026-10-01', '2026-10-31'])).toEqual([])
    expect(await total()).toBe(600000)
    await restoreTransaction(db, id)
    expect(await db.getAll(Q.transactionsBetween, ['2026-10-01', '2026-10-31'])).toHaveLength(1)
  })

  it('list rows carry display names and newest first', async () => {
    const party = await createParty(db, USER, { name: 'Company A', kind: 'company' })
    await createTransaction(db, USER, { ...base, occurred_on: '2026-10-01', occurred_at: '2026-10-01T04:00:00.000Z', type: 'income', amount_minor: 8000000, account_id: bank, category_id: CAT_SALARY, party_id: party })
    await createTransaction(db, USER, { ...base, type: 'expense', amount_minor: 3000, account_id: cash, category_id: CAT_FOOD, note: 'Tea' })
    const rows = await db.getAll<TransactionView>(Q.transactionsBetween, ['2026-10-01', '2026-10-31'])
    expect(rows.map((r) => r.occurred_on)).toEqual(['2026-10-07', '2026-10-01'])
    expect(rows[0]).toMatchObject({ category_name: 'Food', account_name: 'Cash', note: 'Tea' })
    expect(rows[1]).toMatchObject({ party_name: 'Company A', category_name: 'Salary', account_name: 'Bank' })
  })

  it('update to a transfer clears the category (server would reject it otherwise)', async () => {
    const id = await createTransaction(db, USER, { ...base, type: 'expense', amount_minor: 3000, account_id: cash, category_id: CAT_FOOD })
    await updateTransaction(db, id, { ...base, type: 'transfer', amount_minor: 3000, account_id: cash, to_account_id: bank })
    const row = await db.getOptional<{ type: string; category_id: string | null; to_account_id: string }>('select * from transactions where id = ?', [id])
    expect(row).toMatchObject({ type: 'transfer', category_id: null, to_account_id: bank })
  })

  it('invalid input throws ValidationError with field paths and writes nothing', async () => {
    const err = await createTransaction(db, USER, { ...base, type: 'expense', amount_minor: 0, account_id: cash }).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as ValidationError).fields).toEqual(expect.arrayContaining(['amount_minor', 'category_id']))
    expect(await db.getAll('select * from transactions')).toEqual([])
  })

  it('month summary counts income and spending, never transfers', async () => {
    await createTransaction(db, USER, { ...base, type: 'expense', amount_minor: 3000, account_id: cash, category_id: CAT_FOOD })
    await createTransaction(db, USER, { ...base, type: 'income', amount_minor: 10000, account_id: bank, category_id: CAT_SALARY })
    await createTransaction(db, USER, { ...base, type: 'transfer', amount_minor: 99999, account_id: bank, to_account_id: cash })
    await createTransaction(db, USER, { ...base, occurred_on: '2026-09-30', type: 'expense', amount_minor: 7, account_id: cash, category_id: CAT_FOOD })
    expect(await db.getOptional(Q.monthSummary, ['2026-10-01', '2026-10-31'])).toEqual({ income: 10000, expense: 3000 })
  })

  it('last account used for a category', async () => {
    await createTransaction(db, USER, { ...base, occurred_at: '2026-10-07T01:00:00.000Z', type: 'expense', amount_minor: 1, account_id: cash, category_id: CAT_FOOD })
    await createTransaction(db, USER, { ...base, occurred_at: '2026-10-07T02:00:00.000Z', type: 'expense', amount_minor: 1, account_id: bank, category_id: CAT_FOOD })
    expect(await db.getOptional(Q.lastAccountForCategory, [CAT_FOOD])).toEqual({ account_id: bank })
  })

  it('daily net (non-transfer) for the balance trend', async () => {
    await createTransaction(db, USER, { ...base, occurred_on: '2026-10-06', type: 'expense', amount_minor: 100, account_id: cash, category_id: CAT_FOOD })
    await createTransaction(db, USER, { ...base, type: 'income', amount_minor: 500, account_id: cash, category_id: CAT_SALARY })
    await createTransaction(db, USER, { ...base, type: 'transfer', amount_minor: 50, account_id: cash, to_account_id: bank })
    expect(await db.getAll(Q.dailyNet, ['2026-10-01'])).toEqual([
      { day: '2026-10-06', net: -100 },
      { day: '2026-10-07', net: 500 },
    ])
  })
})

describe('review fixes', () => {
  it('trend counts transfers between archived and active accounts', async () => {
    await createTransaction(db, USER, { ...base, type: 'transfer', amount_minor: 5000, account_id: bank, to_account_id: cash })
    await archiveAccount(db, bank, true)
    // Active total rose by 5,000 today (cash gained it, bank is archived).
    expect(await db.getAll(Q.dailyNet, ['2026-10-01'])).toEqual([{ day: '2026-10-07', net: 5000 }])
  })

  it('orders mixed timestamp formats by real time', async () => {
    const a = await createTransaction(db, USER, { ...base, occurred_at: '2026-10-07T09:00:00.000Z', type: 'expense', amount_minor: 1, account_id: cash, category_id: CAT_FOOD })
    await db.execute("update transactions set occurred_at = '2026-10-07 11:00:00.000Z' where id = ?", [a])
    await createTransaction(db, USER, { ...base, occurred_at: '2026-10-07T10:00:00.000Z', type: 'expense', amount_minor: 2, account_id: cash, category_id: CAT_FOOD })
    const rows = await db.getAll<TransactionView>(Q.transactionsBetween, ['2026-10-07', '2026-10-07'])
    expect(rows.map((r) => r.amount_minor)).toEqual([1, 2])
    expect(rows[0]!.occurred_at).toBe('2026-10-07T11:00:00.000Z')
  })

  it('account opening date can be given (local day)', async () => {
    const id = await createAccount(db, USER, { name: 'Wallet', type: 'cash', opening_date: '2026-10-07' })
    expect(await db.getOptional('select opening_date from accounts where id = ?', [id])).toEqual({ opening_date: '2026-10-07' })
  })
})
