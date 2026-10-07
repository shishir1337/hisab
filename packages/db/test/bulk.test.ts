import { describe, expect, it } from 'vitest'
import { defaultCategoryId, ensureDefaultCategories } from '../src/defaults'
import { bulkRecategorize, bulkRestore, bulkSoftDelete, createAccount, createTransaction } from '../src/mutations'
import { Q } from '../src/queries'
import { createTestDb } from './sqlite'

const U = '0192f5a0-0000-7000-8000-0000000000aa'
const base = { occurred_on: '2026-10-07', occurred_at: '2026-10-07T10:00:00.000Z' }

async function setup() {
  const db = createTestDb()
  await ensureDefaultCategories(db, U)
  const cash = await createAccount(db, U, { name: 'Cash', type: 'cash' })
  const bank = await createAccount(db, U, { name: 'Bank', type: 'bank' })
  const food = defaultCategoryId(U, 'expense', 'Food')
  const e1 = await createTransaction(db, U, { ...base, type: 'expense', amount_minor: 100, account_id: cash, category_id: food })
  const e2 = await createTransaction(db, U, { ...base, type: 'expense', amount_minor: 200, account_id: cash, category_id: food })
  const inc = await createTransaction(db, U, { ...base, type: 'income', amount_minor: 900, account_id: cash, category_id: defaultCategoryId(U, 'income', 'Salary') })
  const tr = await createTransaction(db, U, { ...base, type: 'transfer', amount_minor: 50, account_id: cash, to_account_id: bank })
  return { db, e1, e2, inc, tr }
}

describe('bulk operations', () => {
  it('bulk delete and restore', async () => {
    const { db, e1, e2 } = await setup()
    await bulkSoftDelete(db, [e1, e2])
    expect(await db.getAll(Q.transactionsBetween, ['2026-10-01', '2026-10-31'])).toHaveLength(2)
    await bulkRestore(db, [e1, e2])
    expect(await db.getAll(Q.transactionsBetween, ['2026-10-01', '2026-10-31'])).toHaveLength(4)
  })

  it('recategorize only touches rows of the same kind; returns how many changed', async () => {
    const { db, e1, e2, inc, tr } = await setup()
    const groceries = defaultCategoryId(U, 'expense', 'Groceries')
    expect(await bulkRecategorize(db, [e1, e2, inc, tr], groceries)).toBe(2)
    const rows = await db.getAll<{ id: string; category_id: string | null }>('select id, category_id from transactions')
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.category_id]))
    expect(byId[e1]).toBe(groceries)
    expect(byId[e2]).toBe(groceries)
    expect(byId[inc]).toBe(defaultCategoryId(U, 'income', 'Salary'))
    expect(byId[tr]).toBeNull()
  })

  it('report rows for a month', async () => {
    const { db } = await setup()
    const rows = await db.getAll<{ type: string; category_name: string | null }>(Q.reportRows, ['2026-10-01', '2026-10-31'])
    expect(rows.map((r) => r.type).sort()).toEqual(['expense', 'expense', 'income', 'transfer'])
  })
})

import { createLending } from '../src/people-mutations'
import { createParty } from '../src/mutations'
import { bulkSetCategories } from '../src/mutations'

describe('m5 review fixes', () => {
  it('bulk delete never touches EMI / lending movements', async () => {
    const { db, e1 } = await setup()
    const cash = (await db.getOptional<{ id: string }>("select id from accounts where name = 'Cash'"))!.id
    const p = await createParty(db, U, { name: 'Rafiq' })
    await createLending(db, U, { party_id: p, direction: 'lent', principal_minor: 100, started_on: '2026-10-07', account_id: cash })
    const lendTx = (await db.getOptional<{ id: string }>("select id from transactions where type = 'lending_out'"))!.id
    expect(await bulkSoftDelete(db, [e1, lendTx])).toBe(1)
    expect(await db.getOptional("select deleted_at from transactions where id = ?", [lendTx])).toEqual({ deleted_at: null })
  })

  it('recategorize returns the previous categories so it can be undone', async () => {
    const { db, e1, e2 } = await setup()
    const food = defaultCategoryId(U, 'expense', 'Food')
    const prev = await bulkRecategorizeWithUndo(db, [e1, e2], defaultCategoryId(U, 'expense', 'Rent'))
    expect(prev).toEqual({ [e1]: food, [e2]: food })
    await bulkSetCategories(db, prev)
    const rows = await db.getAll<{ category_id: string }>('select category_id from transactions where id in (?, ?)', [e1, e2])
    expect(rows.every((r) => r.category_id === food)).toBe(true)
  })
})

import { bulkRecategorizeWithUndo } from '../src/mutations'
