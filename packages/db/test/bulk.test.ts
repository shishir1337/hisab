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
