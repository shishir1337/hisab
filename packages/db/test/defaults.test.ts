import { md5Uuid } from '@hisab/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, defaultCategoryId, ensureDefaultCategories } from '../src/defaults'
import { createAccount, createTransaction } from '../src/mutations'
import { createTestDb } from './sqlite'

const USER = '0192f5a0-0000-7000-8000-0000000000aa'

describe('default categories', () => {
  it('13 expense + 5 income, matching the server seed', () => {
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense')).toHaveLength(13)
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'income')).toHaveLength(5)
  })

  it('ids are md5(user:kind:name) — identical to the Postgres seed', () =>
    expect(defaultCategoryId(USER, 'expense', 'Food')).toBe(md5Uuid(`${USER}:expense:Food`)))

  it('seeds an empty local database once (idempotent)', async () => {
    const db = createTestDb()
    expect(await ensureDefaultCategories(db, USER)).toBe(18)
    expect(await ensureDefaultCategories(db, USER)).toBe(0)
    expect(await db.getAll('select id from categories')).toHaveLength(18)
  })

  it('does nothing when categories already synced down', async () => {
    const db = createTestDb()
    await db.execute(`insert into categories (id, user_id, name, kind) values ('x', ?, 'Mine', 'expense')`, [USER])
    expect(await ensureDefaultCategories(db, USER)).toBe(0)
  })

  it('seeded ids pass transaction validation', async () => {
    const db = createTestDb()
    await ensureDefaultCategories(db, USER)
    const cash = await createAccount(db, USER, { name: 'Cash', type: 'cash' })
    await expect(
      createTransaction(db, USER, {
        type: 'expense',
        amount_minor: 100,
        account_id: cash,
        category_id: defaultCategoryId(USER, 'expense', 'Food'),
        occurred_on: '2026-10-07',
        occurred_at: '2026-10-07T10:00:00.000Z',
      }),
    ).resolves.toBeTruthy()
  })
})

describe('review fixes', () => {
  it('concurrent seeding does not throw or duplicate', async () => {
    const db = createTestDb()
    await Promise.all([ensureDefaultCategories(db, USER), ensureDefaultCategories(db, USER)])
    expect(await db.getAll('select id from categories')).toHaveLength(18)
  })
})
